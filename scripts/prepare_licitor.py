#!/usr/bin/env python3
"""Build ATLAS exclusively from the cached Licitor census. No network calls."""
import collections, csv, datetime, gzip, hashlib, json, re, unicodedata, zoneinfo
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'licitor_audit/lots_audiences.csv'
CENSUS_RESULT=ROOT/'licitor_audit/FINAL_RESULT.json'  # écrit à la fin de chaque collecte
FIRST_YEAR=1999  # début des archives Licitor ; une audience plus ancienne est une date atypique
URL_PREFIX='https://www.licitor.com/annonce/'  # début commun à tous les liens, stocké une seule fois
ORIGIN='commune_publiee_licitor'  # origine de la commune, identique pour toutes les entrées
MONTHS={'janvier':1,'fevrier':2,'mars':3,'avril':4,'mai':5,'juin':6,'juillet':7,'aout':8,'septembre':9,'octobre':10,'novembre':11,'decembre':12}
LABELS={'appartements':'Appartements','maisons':'Maisons','terrains':'Terrains','parkings':'Parkings','immeubles':'Immeubles','locaux-commerciaux':'Locaux commerciaux','entrepots-locaux-activites':'Entrepôts et locaux d’activité','autres-biens-immobiliers':'Autres biens immobiliers','actifs-immateriels':'Actifs immatériels à isoler'}
def normalized(v):return unicodedata.normalize('NFKD',v).encode('ascii','ignore').decode().lower()
def category(r):
    if r['bien_immateriel_a_isoler']=='True':return 'actifs-immateriels'
    n=normalized(r['nature'])
    for key,pattern in [('immeubles',r'immeuble|ensemble immobilier'),('appartements',r'appartement|studio|logement|duplex'),('maisons',r'maison|pavillon|villa'),('parkings',r'parking|garage|stationnement|box'),('terrains',r'terrain|parcelle|terre agricole'),('entrepots-locaux-activites',r'entrepot|hangar|atelier|industriel|activite'),('locaux-commerciaux',r'commercial|commerce|boutique|bureau')]:
        if re.search(pattern,n):return key
    return 'autres-biens-immobiliers'
def date_from_url(url):
    slug=normalized(url.split('/')[-1].split('.html')[0])
    m=re.search(r'-(\d{1,2})(?:er)?-([a-z]+)-(\d{4})$',slug)
    if not m or m[2] not in MONTHS:raise ValueError('Date illisible : '+url)
    return datetime.date(int(m[3]),MONTHS[m[2]],int(m[1])).isoformat()
def dump(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
def collection_date():
    """Date (heure de Paris) de la fin de la collecte, lue dans le résultat du recensement."""
    finished=datetime.datetime.fromisoformat(json.loads(CENSUS_RESULT.read_text())['timestamp'])
    return finished.astimezone(zoneinfo.ZoneInfo('Europe/Paris')).date()
def main():
    rows=list(csv.DictReader(SOURCE.open(encoding='utf-8-sig',newline='')))
    collected=collection_date()
    last_year=collected.year+1  # audiences à venir annoncées jusqu'à l'année suivante au plus
    ref={r['code']:r for r in json.loads((ROOT/'data/reference/communes.json').read_text())}
    shapes=json.loads((ROOT/'data/reference/departements.geojson').read_text())
    deps={f['properties']['code']:f['properties']['nom'] for f in shapes['features']}
    # Population municipale INSEE (geo.api.gouv.fr) ; celle d'un département est la somme de ses communes.
    population={c['code']:c.get('population') or 0 for c in json.loads((ROOT/'data/reference/population.json').read_text())}
    dep_population=collections.Counter()
    for code,c in ref.items():dep_population[c['codeDepartement']]+=population.get(code,0)
    organizers={r['url'].split('/')[4]:r['label'] for r in csv.DictReader((ROOT/'licitor_audit/juridictions.csv').open(encoding='utf-8-sig'))}
    addresses=[];address_indices={};audiences=[];audience_indices={};natures=[];nature_indices={};reasons=[];reason_indices={}
    communes={};records=[];anomalies=[]
    repeated=collections.Counter(r['annonce_id'] for r in rows)
    def intern(table,indices,value):
        if value not in indices:indices[value]=len(table);table.append(value)
        return indices[value]
    for row in rows:
        source_date=date_from_url(row['source_audience']);year=int(source_date[:4]);anomaly=year<FIRST_YEAR or year>last_year
        if anomaly:anomalies.append({'id':row['entree_audience_id'],'date_source':source_date,'url':row['url'],'source_audience':row['source_audience']})
        code=row['code_insee'];raw_dep=row['departement_source'];dep=raw_dep if raw_dep in deps else ''
        if code:dep=ref[code]['codeDepartement'];communes[code]={'name':ref[code]['nom'],'dep':dep,'center':ref[code].get('centre',{}).get('coordinates'),'population':population.get(code,0)}
        # Overseas codes in the listings are textual; require a supporting URL slug.
        if not dep:
            for slug,d in [('guadeloupe','971'),('martinique','972'),('la-reunion','974'),('saint-pierre-et-miquelon','975')]:
                if '/'+slug+'/' in row['url']:dep=d
        immaterial=row['bien_immateriel_a_isoler']=='True'
        coordinates=[float(row['longitude_centre_commune']),float(row['latitude_centre_commune'])] if code and not immaterial else None
        if not row['url'].startswith(URL_PREFIX):raise ValueError('Lien d’annonce inattendu : '+row['url'])
        record={'id':row['entree_audience_id'],'announcementId':row['annonce_id'],'date':source_date,'year':None if anomaly else year,
            'category':category(row),'address':intern(addresses,address_indices,row['commune_source']+' · '+raw_dep+' (adresse exacte non collectée)'),
            'nature':intern(natures,nature_indices,row['nature']),'url':row['url'][len(URL_PREFIX):],'audience':intern(audiences,audience_indices,row['source_audience']),
            'organizer':row['source_audience'].split('/')[4],'commune':code,'dep':dep,'precision':'commune' if coordinates else 'non_resolue',
            'coordinates':coordinates,'reason':intern(reasons,reason_indices,'actif_immateriel_exclu' if immaterial else row['justification'])}
        # Cases oui/non écrites seulement quand la réponse est « oui » : une case absente vaut « non ».
        if repeated[row['annonce_id']]>1:record['similar']=True
        if immaterial:record['immaterial']=True
        if anomaly:record['dateAnomaly']=True
        if row['historique']!='True':record['upcoming']=True
        records.append(record)
    precision={k:sum(r['precision']==k for r in records) for k in ['adresse','rue','commune','non_resolue']}
    years=collections.Counter(r['year'] for r in records if r['year'] is not None)
    audit={'source':'Licitor — listes publiques d’audiences','source_file':str(SOURCE.relative_to(ROOT)),
        'sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'dataset':'licitor','version':'licitor-commune-v1',
        'source_rows':len(rows),'valid_rows':len(records),'unique_urls':len(repeated),'unit':'entrée de bien/lot publiée dans une audience',
        'anomalies':len(anomalies),'min_year':min(years),'max_year':max(years),'years':dict(sorted(years.items())),
        'precision':precision,'immaterial':sum('immaterial' in r for r in records),'without_commune':sum(not r['commune'] for r in records),
        'without_department':sum(not r['dep'] for r in records),'historical':sum('upcoming' not in r for r in records),
        'upcoming':sum('upcoming' in r for r in records),'origin':ORIGIN,'prepared_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'collected_at':collected.isoformat(),'juridictions':len(organizers),
        'population_source':'Population municipale INSEE, geo.api.gouv.fr','population_total':sum(population.values()),'heat_resolution':'commune','geocoder':None,'missing':{'Adresse exacte':len(records)}}
    cube=collections.Counter((r['year'],r['category'],r['dep'],r['commune'],r['precision']) for r in records)
    data={'records':records,'urlPrefix':URL_PREFIX,'addresses':addresses,'audiences':audiences,'natures':natures,'reasons':reasons,
        'organizers':organizers,'communes':communes,'departments':deps,'categories':LABELS,'audit':audit,
        'departmentPopulation':{d:dep_population[d] for d in deps if dep_population[d]}}
    # Contrôles valables pour toute collecte. Les effectifs exacts d'une collecte
    # donnée (87 811 entrées…) sont vérifiés dans tests/test_data.py.
    assert len({r['id'] for r in records})==len(records), 'Identifiants d’entrée en double'
    assert sum(precision.values())==len(records), 'Précision manquante pour certaines entrées'
    assert sum(cube.values())==len(records), 'Agrégations incohérentes avec les entrées'
    for feature in shapes['features']:feature['id']=feature['properties']['code']
    dump(ROOT/'app/data/atlas.json',data);dump(ROOT/'app/data/departements.geojson',shapes)
    dump(ROOT/'app/data/anomalies.json',anomalies);dump(ROOT/'app/data/pilot.json',{'dataset':'licitor','size':0,'records':[]})
    dump(ROOT/'reports/audit-licitor.json',audit)
    # Second calcul indépendant des totaux, utilisé seulement par les tests : il n'est pas envoyé au navigateur.
    dump(ROOT/'reports/aggregates.json',[[*k,v] for k,v in cube.items()])
    raw=(ROOT/'app/data/atlas.json').read_bytes()
    print(json.dumps({'records':len(records),'localized':precision['commune'],'years':[min(years),max(years)],'date_anomalies':len(anomalies),'bytes':len(raw),'gzip_bytes':len(gzip.compress(raw,compresslevel=5))},ensure_ascii=False))
if __name__=='__main__':main()
