"""Offline lower-bound locality census and auditable report. Never fetches Licitor."""
import csv, datetime, gzip, json, re, sqlite3, unicodedata
from pathlib import Path
OUT=Path(__file__).resolve().parent;ROOT=OUT.parent
def norm(v):
    s=unicodedata.normalize('NFKD',v.replace('œ','oe').replace('Œ','OE').replace('æ','ae')).encode('ascii','ignore').decode().lower()
    s=re.sub(r'\bst\b','saint',s);s=re.sub(r'\bste\b','sainte',s)
    return re.sub('[^a-z0-9]','',s)
def summarize():
    ref=json.loads((ROOT/'data/reference/communes.json').read_text())
    modern={r['code']:r for r in ref};names={}
    for r in ref:names.setdefault((r['codeDepartement'],norm(r['nom'])),set()).add(r['code'])
    historic={}
    file=OUT/'communes_2018.geojson.gz'
    if file.exists():
        for f in json.load(gzip.open(file))['features']:
            r=f['properties']
            if r['code'] in modern:
                historic.setdefault((r['departement'],norm(r['nom'])),set()).add(r['code'])
    db=sqlite3.connect(OUT/'archive_walk.sqlite');rows=[];matched=0;historical=0;non_realty=0
    for record in db.execute('SELECT id,url,city,dep,nature,origin_page,context_date,price_or_status FROM ads ORDER BY CAST(id AS INTEGER)'):
        ident,url,city,dep,nature,origin,date,value=record
        candidates=names.get((dep,norm(city)),set());reason='nom_actuel_exact'
        if dep=='75' and re.fullmatch(r'paris\d*(?:er|eme|e)?',norm(city)):candidates={'75056'};reason='paris_commune'
        elif dep=='69' and re.fullmatch(r'lyon\d*(?:er|eme|e)?',norm(city)):candidates={'69123'};reason='lyon_commune'
        elif dep=='13' and re.fullmatch(r'marseille\d*(?:er|eme|e)?',norm(city)):candidates={'13055'};reason='marseille_commune'
        if len(candidates)!=1:
            candidates=historic.get((dep,norm(city)),set());reason='nom_historique_2018_code_conserve'
        code=next(iter(candidates)) if len(candidates)==1 else ''
        if code:matched+=1;historical+=reason.startswith('nom_historique')
        else:reason='commune_a_verifier'
        immaterial=bool(re.search(r'parts? sociales?|fonds de commerce|droits? sociaux|fonds artisanal',nature,re.I))
        non_realty+=immaterial
        rows.append(dict(id=ident,url=url,commune_source=city,departement_source=dep,nature=nature,
            code_insee=code,localisation='commune_approximative' if code else 'a_verifier',
            justification=reason,source_audience=origin,date_contexte_url=date,resultat_texte_publie=value,
            bien_immateriel_a_isoler=immaterial))
    states=dict(db.execute('SELECT state,count(*) FROM pages GROUP BY state'));db.close()
    with (OUT/'annonces_localisables.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    census=json.loads((OUT/'census.json').read_text())
    counts=dict(timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),states=states,
        unique_ads=len(rows),commune_resolved=matched,historical_name_matches=historical,
        not_resolved=len(rows)-matched,immaterial_assets=non_realty,
        physically_mappable_lower_bound=sum(bool(r['code_insee']) and not r['bien_immateriel_a_isoler'] for r in rows),
        traversal_finished=not any(states.get(k,0) for k in ['pending','running','blocked']))
    (OUT/'locality_counts.json').write_text(json.dumps(counts,ensure_ascii=False,indent=2))
    print(json.dumps(counts,ensure_ascii=False))
    status='terminé pour les pages publiques découvertes' if counts['traversal_finished'] else 'en cours — résultat provisoire'
    report=f'''# Licitor — Recensement des annonces et possibilité de cartographie

État : **{status}**. Dernière synthèse : {counts['timestamp']} (UTC).
ATLAS existante n’est pas modifiée. Aucune localisation de tribunal n’est utilisée.

## Volumes affichés dans les index, contrôlés le 13 octobre 2026

- Somme de tous les compteurs des 167 juridictions de l’index historique : **87 337 entrées de biens/lots**.
- Sept index géographiques historiques : **32 154 annonces**.
- Six index géographiques des prochaines annonces : **474 annonces**.
- Pagination géographique complète annoncée : **6 530 pages**, à cinq annonces par page.

Les compteurs judiciaires incluent des annonces qui ne figurent pas parmi les résultats
géographiques. Ils ne prouvent ni autant d’adjudications réalisées ni autant de biens
physiques distincts. Une annonce peut concerner plusieurs lots ; un même bien peut
faire l’objet de plusieurs annonces. Les totaux historiques et à venir ne sont pas
additionnés pour affirmer un nombre de biens distincts sans rapprochement des identifiants.

Tous les index géographiques ont été consultés et leurs première et dernière pages
contrôlées : 108 entrées contrôlées comportaient commune et département. **Ce contrôle
des bornes ne remplace pas le parcours des annonces.** Le détail est dans `zones.csv`,
les 167 compteurs dans `juridictions.csv` et les preuves HTML dans ce dossier.

## Parcours effectif des archives

Le collecteur suit toutes les dates d’audience publiques liées depuis les juridictions,
y compris les annonces futures et la pagination des annonces. Il ignore les variantes
de calendrier qui ne changent pas les annonces. Une URL d’annonce / un identifiant est
compté une seule fois, même s’il figure dans plusieurs audiences.

À cette synthèse : **{len(rows):,} annonces distinctes recensées**, dont **{matched:,}**
correspondent à une commune officielle. Parmi elles, {historical} correspondances utilisent
un nom de 2018 dont le code INSEE existe encore dans le référentiel actuel.
**{len(rows)-matched:,}** localisations restent à vérifier. {non_realty} annonces concernent
explicitement des actifs immatériels (parts sociales, fonds...) et sont isolées.

Le minimum actuellement cartographiable au niveau communal, hors actifs immatériels
explicitement repérés, est **{counts['physically_mappable_lower_bound']:,} annonces**.
Ce nombre est {('final pour les enregistrements collectés' if counts['traversal_finished'] else 'provisoire et non extrapolé à tout Licitor')}.

Les correspondances sont exactes après normalisation des accents, espaces, ligatures
et abréviations Saint / Sainte, avec contrôle du département. Paris, Lyon et Marseille
sont rattachés à la commune. Les noms historiques ne sont acceptés que sur un code
INSEE encore présent dans le référentiel actuel ; aucun rapprochement flou ne choisit
arbitrairement une ville homonyme. Les noms courts, fusions non résolues, communes
multiples et localisations étrangères restent à vérifier.

**Précision : commune approximative.** Le centre officiel de cette commune pourrait
servir à une carte explicitement approximative ; il ne représenterait pas l’adresse
exacte. Aucun géocodage des rues n’a été effectué. Les champs des pages individuelles
de biens ne sont pas encore audités exhaustivement. La disponibilité d’une adresse
exacte et le taux de géocodage à la rue ne sont donc pas déduits de ces nombres.

## Méthode et limites

Cache SQLite et HTML compressés après chaque page. Au maximum deux requêtes en vol,
espacées d’au moins 0,6 seconde au début ; après deux coupures réseau, une seule
requête en vol et au moins 1,2 seconde entre deux départs ; ni authentification ni contournement. Arrêt en cas
de protection / restriction ; pages 404 ou 410 signalées séparément. Les chemins
interdits dans `robots.txt` ne sont pas utilisés. Les documents PDF, médias et
coordonnées des avocats ne sont pas collectés.

État des pages : `{json.dumps(states,ensure_ascii=False)}`. Un parcours n’est complet
que lorsque la file publique est épuisée ; les pages manquantes ou restrictions
peuvent empêcher la récupération de tout le volume annoncé. Les compteurs peuvent
évoluer pendant la collecte : leurs valeurs initiales sont des instantanés datés.

Le prix ou statut enregistré est uniquement le texte publié dans la liste de l’audience,
sans certification de transaction ni assimilation d’une mise à prix à une adjudication.
Cette mission est un recensement de cartographie, pas une vérification des actes.

## Sources et fichiers

- [Index historique Licitor](https://www.licitor.com/historique-des-adjudications.html).
- [Index actuel Licitor](https://www.licitor.com/).
- [API officielle des communes](https://geo.api.gouv.fr/decoupage-administratif/communes),
  snapshot conservé dans le projet le 9 octobre 2026.
- [Référentiel historique Etalab / ADMIN EXPRESS 2018](https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/2018/geojson/).
- `annonces_localisables.csv` : identifiants, localités, codes, précision et sources.
- `archive_walk.sqlite` : cache et file de parcours ; `walk_progress.json` : avancement.
- `locality_counts.json` : contrôles chiffrés ; `census.json` : compteurs des index.

Pour actualiser cette synthèse sans accès réseau : `python3 licitor_audit/summarize_walk.py`.
'''
    lot_file=OUT/'lot_counts.json'
    if lot_file.exists():
        lots=json.loads(lot_file.read_text())
        report += f'''
## Résultat final : entrées de biens/lots et annonces

Le reparcours hors ligne de toutes les pages canoniques conserve les entrées
répétées à l’intérieur d’une annonce : **{lots['entrees_audiences']:,} entrées**,
dont **{lots['historique']:,} historiques** et **{lots['a_venir']:,} à venir**.
Les compteurs historiques concordent exactement pour **{lots['juridictions_compteurs_exacts']}
juridictions sur {lots['juridictions']}**. Voir `rapprochement_compteurs.csv`.

Ces entrées renvoient à **{lots['identifiants_annonces']:,} identifiants d’annonce**.
Plusieurs biens/lots partagent parfois une URL. Par exemple, l’audience de Limoges
du 4 octobre 2021 comporte 30 entrées renvoyant à l’identifiant 086679.
La [fiche publiée](https://www.licitor.com/annonce/08/66/79/vente-aux-encheres/un-appartement/limoges/haute-vienne/086679.html),
contrôlée séparément et conservée dans `exemple_086679.html`, confirme
explicitement une vente annoncée en trente lots.
Les observations qui partagent une URL ne sont donc pas automatiquement supprimées.
Une même propriété peut aussi être annoncée plusieurs fois à des dates différentes ;
le nombre de biens physiques uniques n’est pas établi.

| Indicateur | Nombre |
| --- | ---: |
| Entrées publiées parcourues | {lots['entrees_audiences']:,} |
| Entrées avec commune officielle identifiée | {lots['communes_resolues']:,} |
| Commune non résolue | {lots['non_resolues']:,} |
| Actifs immatériels repérés, avec ou sans commune | {lots['actifs_immateriels']:,} |
| Entrées immobilières localisables à la commune | **{lots['entrees_immobilieres_localisables_commune']:,}** |

Le taux localisable hors actifs immatériels repérés est
**{100*lots['entrees_immobilieres_localisables_commune']/lots['entrees_audiences']:.2f} %**
des {lots['entrees_audiences']:,} entrées parcourues. Il s’agit d’un minimum vérifié
avec rapprochement conservateur des noms, sans géocodage des adresses individuelles.
Les actifs immatériels et les communes non résolues se chevauchent : ces deux
catégories ne doivent pas être additionnées telles quelles.

`lots_audiences.csv` contient les {lots['entrees_audiences']:,} entrées avec commune,
précision, coordonnées du centre officiel et URL d’audience. Les coordonnées sont
**approximatives à la commune**, jamais des coordonnées de tribunaux.
`annonces_localisables.csv` conserve une ligne par identifiant d’annonce et
la première localisation observée ; pour une annonce multi-lots, utiliser
`lots_audiences.csv` afin de ne pas perdre les autres localités.

Les 29 475 réponses HTTP mises en cache incluent des variantes de calendrier
récupérées au début ; elles sont exclues du comptage final des entrées.
Les coupures réseau ont été reprises depuis le cache ; aucune restriction
HTTP 401, 403 ou 429 n’a été contournée. L’exhaustivité établie porte sur les
listes publiques d’audiences découvertes et leurs compteurs, pas sur une
base privée ni sur la lecture intégrale du contenu de chaque fiche détaillée.
'''
        report=report.replace('## Volumes affichés',f"## Résultat principal\n\n**{lots['entrees_immobilieres_localisables_commune']:,} entrées de biens/lots localisables approximativement à la commune**, sur {lots['entrees_audiences']:,} entrées publiques parcourues ({100*lots['entrees_immobilieres_localisables_commune']/lots['entrees_audiences']:.2f} %). Les {lots['identifiants_annonces']:,} identifiants d’annonce ne constituent pas autant de biens physiques uniques prouvés.\n\n## Volumes affichés")
        counts['lot_census']=lots
    (OUT/'FINAL_RESULT.json').write_text(json.dumps(counts,ensure_ascii=False,indent=2))
    (OUT/'RAPPORT.md').write_text(report,encoding='utf-8')
    return counts
if __name__=='__main__':summarize()
