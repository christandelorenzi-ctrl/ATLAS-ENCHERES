# Licitor — Recensement des annonces et possibilité de cartographie

État : **terminé pour les pages publiques découvertes**. Dernière synthèse : 2026-10-13T22:20:04.231755+00:00 (UTC).
ATLAS existante n’est pas modifiée. Aucune localisation de tribunal n’est utilisée.

## Résultat principal

**85,232 entrées de biens/lots localisables approximativement à la commune**, sur 87,811 entrées publiques parcourues (97.06 %). Les 80,591 identifiants d’annonce ne constituent pas autant de biens physiques uniques prouvés.

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

À cette synthèse : **80,591 annonces distinctes recensées**, dont **78,367**
correspondent à une commune officielle. Parmi elles, 824 correspondances utilisent
un nom de 2018 dont le code INSEE existe encore dans le référentiel actuel.
**2,224** localisations restent à vérifier. 112 annonces concernent
explicitement des actifs immatériels (parts sociales, fonds...) et sont isolées.

Le minimum actuellement cartographiable au niveau communal, hors actifs immatériels
explicitement repérés, est **78,272 annonces**.
Ce nombre est final pour les enregistrements collectés.

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

État des pages : `{"done": 29475}`. Un parcours n’est complet
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

## Résultat final : entrées de biens/lots et annonces

Le reparcours hors ligne de toutes les pages canoniques conserve les entrées
répétées à l’intérieur d’une annonce : **87,811 entrées**,
dont **87,337 historiques** et **474 à venir**.
Les compteurs historiques concordent exactement pour **167
juridictions sur 167**. Voir `rapprochement_compteurs.csv`.

Ces entrées renvoient à **80,591 identifiants d’annonce**.
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
| Entrées publiées parcourues | 87,811 |
| Entrées avec commune officielle identifiée | 85,332 |
| Commune non résolue | 2,479 |
| Actifs immatériels repérés, avec ou sans commune | 117 |
| Entrées immobilières localisables à la commune | **85,232** |

Le taux localisable hors actifs immatériels repérés est
**97.06 %**
des 87,811 entrées parcourues. Il s’agit d’un minimum vérifié
avec rapprochement conservateur des noms, sans géocodage des adresses individuelles.
Les actifs immatériels et les communes non résolues se chevauchent : ces deux
catégories ne doivent pas être additionnées telles quelles.

`lots_audiences.csv` contient les 87,811 entrées avec commune,
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
