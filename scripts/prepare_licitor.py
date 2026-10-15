#!/usr/bin/env python3
"""Build ATLAS exclusively from the cached Licitor census. No network calls."""
import collections, csv, datetime, gzip, hashlib, json, re, unicodedata
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'licitor_audit/lots_audiences.csv'
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
def main():
    rows=list(csv.DictReader(SOURCE.open(encoding='utf-8-sig',newline='')))
    ref={r['code']:r for r in json.loads((ROOT/'data/reference/communes.json').read_text())}
    shapes=json.loads((ROOT/'data/reference/departements.geojson').read_text())
    deps={f['properties']['code']:f['properties']['nom'] for f in shapes['features']}
    organizers={r['url'].split('/')[4]:r['label'] for r in csv.DictReader((ROOT/'licitor_audit/juridictions.csv').open(encoding='utf-8-sig'))}
    addresses=[];address_indices={};audiences=[];audience_indices={};natures=[];nature_indices={};communes={};records=[];anomalies=[]
    repeated=collections.Counter(r['annonce_id'] for r in rows)
    def intern(table,indices,value):
        if value not in indices:indices[value]=len(table);table.append(value)
        return indices[value]
    for row in rows:
        source_date=date_from_url(row['source_audience']);year=int(source_date[:4]);anomaly=year<1999 or year>2026
        if anomaly:anomalies.append({'id':row['entree_audience_id'],'date_source':source_date,'url':row['url'],'source_audience':row['source_audience']})
        code=row['code_insee'];raw_dep=row['departement_source'];dep=raw_dep if raw_dep in deps else ''
        if code:dep=ref[code]['codeDepartement'];communes[code]={'name':ref[code]['nom'],'dep':dep,'center':ref[code].get('centre',{}).get('coordinates')}
        # Overseas codes in the listings are textual; require a supporting URL slug.
        if not dep:
            for slug,d in [('guadeloupe','971'),('martinique','972'),('la-reunion','974'),('saint-pierre-et-miquelon','975')]:
                if '/'+slug+'/' in row['url']:dep=d
        immaterial=row['bien_immateriel_a_isoler']=='True'
        coordinates=[float(row['longitude_centre_commune']),float(row['latitude_centre_commune'])] if code and not immaterial else None
        record={'id':row['entree_audience_id'],'announcementId':row['annonce_id'],'date':source_date,'year':None if anomaly else year,
            'category':category(row),'address':intern(addresses,address_indices,row['commune_source']+' · '+raw_dep+' (adresse exacte non collectée)'),
            'nature':intern(natures,nature_indices,row['nature']),'url':row['url'],'audience':intern(audiences,audience_indices,row['source_audience']),
            'organizer':row['source_audience'].split('/')[4],'commune':code,'dep':dep,'precision':'commune' if coordinates else 'non_resolue',
            'coordinates':coordinates,'score':None,'reason':'actif_immateriel_exclu' if immaterial else row['justification'],
            'origin':'commune_publiee_licitor','similar':repeated[row['annonce_id']]>1,'immaterial':immaterial,'dateAnomaly':anomaly,
            'historical':row['historique']=='True'}
        records.append(record)
    precision={k:sum(r['precision']==k for r in records) for k in ['adresse','rue','commune','non_resolue']}
    years=collections.Counter(r['year'] for r in records if r['year'] is not None)
    audit={'source':'Licitor — listes publiques d’audiences','source_file':str(SOURCE.relative_to(ROOT)),
        'sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'dataset':'licitor','version':'licitor-commune-v1',
        'source_rows':len(rows),'valid_rows':len(records),'unique_urls':len(repeated),'unit':'entrée de bien/lot publiée dans une audience',
        'anomalies':len(anomalies),'min_year':min(years),'max_year':max(years),'years':dict(sorted(years.items())),
        'precision':precision,'immaterial':sum(r['immaterial'] for r in records),'without_commune':sum(not r['commune'] for r in records),
        'without_department':sum(not r['dep'] for r in records),'historical':sum(r['historical'] for r in records),
        'upcoming':sum(not r['historical'] for r in records),'prepared_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'collected_at':'2026-10-14','heat_resolution':'commune','geocoder':None,'missing':{'Adresse exacte':len(records)}}
    cube=collections.Counter((r['year'],r['category'],r['dep'],r['commune'],r['precision']) for r in records)
    data={'records':records,'addresses':addresses,'audiences':audiences,'natures':natures,'organizers':organizers,'communes':communes,
        'departments':deps,'categories':LABELS,'audit':audit,'aggregates':[[*k,v] for k,v in cube.items()]}
    assert len(records)==87811 and len({r['id'] for r in records})==len(records)
    assert precision['commune']==85232 and sum(cube.values())==len(records)
    for feature in shapes['features']:feature['id']=feature['properties']['code']
    dump(ROOT/'app/data/atlas.json',data);dump(ROOT/'app/data/departements.geojson',shapes)
    dump(ROOT/'app/data/anomalies.json',anomalies);dump(ROOT/'app/data/pilot.json',{'dataset':'licitor','size':0,'records':[]})
    dump(ROOT/'reports/audit-licitor.json',audit)
    raw=(ROOT/'app/data/atlas.json').read_bytes()
    print(json.dumps({'records':len(records),'localized':precision['commune'],'years':[min(years),max(years)],'date_anomalies':len(anomalies),'bytes':len(raw),'gzip_bytes':len(gzip.compress(raw,compresslevel=5))},ensure_ascii=False))
if __name__=='__main__':main()
