#!/usr/bin/env python3
"""ATLAS: audit, pilot, cached IGN CSV geocoding and static data preparation.

No source row is deleted. One observation = one URL from the input CSV.
Network operations use curl; build and audit run offline with pandas.
"""
from __future__ import annotations
import argparse, collections, csv, datetime, hashlib, io, json, math, random
import re, sqlite3, subprocess, time, unicodedata
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'resultats-vente-2006-2024.csv'
CACHE = ROOT / 'data/cache/geocoding.sqlite'
API = 'https://data.geopf.fr/geocodage/search/csv'
VERSION = 'atlas-v1-conservative'
LABELS = {'appartements':'Appartements','maisons':'Maisons','terrains':'Terrains',
          'parkings':'Parkings','immeubles':'Immeubles','locaux-commerciaux':'Locaux commerciaux',
          'entrepots-locaux-activites':'Entrepôts et locaux d’activité',
          'autres-biens-immobiliers':'Autres biens immobiliers','biens-exception':'Biens d’exception',
          '':'Non renseignée'}

def dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',',':')), encoding='utf-8')

def norm(value):
    value = unicodedata.normalize('NFKD', value).encode('ascii','ignore').decode().lower()
    value = re.sub(r'\bst\b','saint',value)
    value = re.sub(r'\bste\b','sainte',value)
    return re.sub(r'[^a-z0-9]', '', value)

def clean(value):
    return re.sub(r'\s+', ' ', value).strip()

def load_source():
    # Explicit string types preserve postal codes, IDs and missing versus zero.
    df = pd.read_csv(SOURCE, dtype=str, keep_default_na=False, encoding='utf-8-sig')
    return df.to_dict('records')

class Reference:
    def __init__(self):
        self.communes = json.loads((ROOT/'data/reference/communes.json').read_text())
        self.departments = json.loads((ROOT/'data/reference/departements.geojson').read_text())
        self.by_code = {c['code']:c for c in self.communes}
        self.by_cp = collections.defaultdict(list)
        self.by_name = collections.defaultdict(list)
        for c in self.communes:
            self.by_name[norm(c['nom'])].append(c)
            for cp in c['codesPostaux']: self.by_cp[cp].append(c)
        self.dep_names = {f['properties']['code']:f['properties']['nom'] for f in self.departments['features']}

    def match(self, city, cp=''):
        candidates = self.by_cp.get(cp,[]) if cp else self.by_name.get(norm(city),[])
        exact = [c for c in candidates if norm(c['nom']) == norm(city)]
        return exact[0] if len(exact)==1 else None

    def canonical(self, code):
        if re.fullmatch(r'751\d\d',code): code='75056'
        elif re.fullmatch(r'6938\d',code): code='69123'
        elif re.fullmatch(r'132\d\d',code): code='13055'
        return self.by_code.get(code)

def parse(row, ref):
    address = clean(row['Adresse'])
    cp_match = re.search(r'\b(\d{5})\b',address)
    # Prefer the terminal postal block, not a 5-digit house number.
    conventional = re.match(r'^(.*?),\s*(\d{5})\s+(.+?),\s*France$', address, re.I)
    street=city=cp=''
    if conventional:
        street,cp,city=conventional.groups()
    elif address:
        parts=address.split(',')
        if len(parts)>=2:
            street=','.join(parts[:-2]).strip() if len(parts)>2 else parts[0]
            city=parts[-2].strip()
            cp=cp_match[1] if cp_match else ''
            city=clean(re.sub(r'\b\d{5}\b','',city))
    url_city = row['Url'].split('/')[-2]
    url_match = re.match(r'^(.*)-(\d{2,3}|2[AB])$',url_city,re.I)
    commune=ref.match(city,cp)
    origin='adresse'
    if not address and url_match:
        city=url_match[1]
        possible=ref.by_name.get(norm(city),[])
        possible=[c for c in possible if c['codeDepartement'].lower()==url_match[2].lower()]
        commune=possible[0] if len(possible)==1 else None
        origin='commune_url'
    # Multi-street / number ranges are not a single exact property location.
    multi=bool(re.search(r'\bet\b|\d\s*(?:/|à|-)\s*\d',street,re.I))
    if not address: stratum='vide'
    elif not conventional: stratum='atypique'
    elif not street.strip(' ,"'): stratum='commune'
    elif multi: stratum='multiple'
    elif re.match(r'^\d',street): stratum='numero'
    else: stratum='voie_lieu'
    query=address
    if commune and (not street.strip(' ,"') or not address):
        query=f"{cp} {commune['nom']}".strip()
    # Geocoder query uses address only: never the organizer.
    query=re.sub(r',?\s*(France|La Réunion)$','',query,flags=re.I).strip(' ,')
    key=hashlib.sha256(f'{VERSION}|{query}|{cp}'.encode()).hexdigest()
    return dict(address=address,street=street,city=city,cp=cp,commune=commune,
                origin=origin,multi=multi,stratum=stratum,query=query,key=key)

def connect():
    CACHE.parent.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(CACHE)
    db.execute('CREATE TABLE IF NOT EXISTS geocodes (key TEXT PRIMARY KEY, query TEXT, response TEXT, checked_at TEXT)')
    return db

def cached(db):
    return {key:json.loads(response) for key,response in db.execute('SELECT key,response FROM geocodes')}

def geocode(items, db, batch_size=400):
    known=cached(db)
    unique={p['key']:p for p in items if p['query']}
    todo=[p for key,p in unique.items() if key not in known or known[key].get('result_status')=='error']
    print(f'{len(unique)} requêtes distinctes, {len(todo)} nouvelles, cache conservé',flush=True)
    for start in range(0,len(todo),batch_size):
        batch=todo[start:start+batch_size]
        path=ROOT/'data/cache/request.csv'
        with path.open('w',encoding='utf-8',newline='') as f:
            writer=csv.DictWriter(f,fieldnames=['key','query','cp'])
            writer.writeheader()
            for p in batch: writer.writerow({k:p[k] for k in ['key','query','cp']})
        command=['curl','-sS','--fail','--max-time','180','-X','POST',API,
                 '-F',f'data=@{path}','-F','columns=query','-F','indexes=address','-F','postcode=cp']
        result=None
        for attempt in range(4):
            response=subprocess.run(command,capture_output=True,text=True)
            if response.returncode==0:
                result=list(csv.DictReader(io.StringIO(response.stdout)))
                if len(result)==len(batch) and all('result_status' in r for r in result): break
                result=None
            print(f'Nouvel essai lot {start}: {response.stderr[:160]}',flush=True)
            time.sleep(min(2**attempt,8))
        if result is None: raise RuntimeError('Lot IGN interrompu. Relancer pour reprendre le cache.')
        now=datetime.datetime.now(datetime.timezone.utc).isoformat()
        for r in result:
            db.execute('INSERT OR REPLACE INTO geocodes VALUES (?,?,?,?)',
                       (r['key'],r['query'],json.dumps(r,ensure_ascii=False),now))
        db.commit()
        print(f'IGN : {min(start+batch_size,len(todo))}/{len(todo)} nouvelles adresses',flush=True)
        time.sleep(.5) # Sequential CSV requests, well below published request limits.
    return cached(db)

def ring_contains(x,y,ring):
    inside=False
    for i in range(len(ring)):
        x1,y1=ring[i][:2]; x2,y2=ring[i-1][:2]
        if (y1>y)!=(y2>y) and x<(x2-x1)*(y-y1)/(y2-y1)+x1: inside=not inside
    return inside

def in_department(coords, code, ref):
    features=[f for f in ref.departments['features'] if f['properties']['code']==code]
    for f in features:
        g=f['geometry']; polys=[g['coordinates']] if g['type']=='Polygon' else g['coordinates']
        for poly in polys:
            if ring_contains(*coords,poly[0]) and not any(ring_contains(*coords,r) for r in poly[1:]): return True
    return False

def classify(p, result, ref):
    source_commune=p['commune']; commune=source_commune
    precision='non_resolue'; coords=None; reason='aucune_correspondance'; score=0.; label=''
    if result and result.get('result_status')=='ok':
        score=float(result.get('result_score') or 0)
        label=result.get('result_label','')
        candidate=ref.canonical(result.get('result_citycode',''))
        postal_ok=not p['cp'] or result.get('result_postcode')==p['cp']
        city_ok=bool(candidate and (candidate['code']==source_commune['code'] if source_commune else
                    norm(p['city']) in [norm(candidate['nom']),norm(result.get('result_oldcity',''))]))
        # Allow street-only atypical records but never infer a town from postcode alone.
        if candidate and city_ok and postal_ok and score>=.65:
            commune=candidate
            try: xy=[float(result['longitude']),float(result['latitude'])]
            except (ValueError,KeyError):
                try: xy=[float(result['result_longitude']),float(result['result_latitude'])]
                except (ValueError,KeyError): xy=[]
            valid_xy=len(xy)==2 and all(math.isfinite(v) for v in xy) and -180<=xy[0]<=180 and -85<=xy[1]<=85
            geo_ok=valid_xy and in_department(xy,candidate['codeDepartement'],ref)
            kind=result.get('result_type')
            try: gap=score-float(result.get('result_score_next') or 0)
            except ValueError: gap=0
            reason='score_ou_precision_insuffisante'
            number=result.get('result_housenumber','')
            number_ok=bool(number and re.search(r'(?<!\d)'+re.escape(number)+r'(?!\d)',p['street'],re.I))
            if geo_ok and not p['multi'] and p['street'].strip(' ,"'):
                if kind=='housenumber' and score>=.85 and gap>=.05 and number_ok:
                    precision='adresse'; coords=xy; reason='adresse_acceptee'
                elif kind in ['housenumber','street','locality'] and score>=.75:
                    precision='rue'; coords=xy; reason='voie_ou_lieu_approximatif'
            elif not geo_ok: reason='coordonnees_hors_contour_ou_invalides'
            elif p['multi']: reason='adresse_multiple'
        else: reason='commune_code_postal_ou_score_non_concordant'
    if coords is None and commune:
        precision='commune'; coords=commune.get('centre',{}).get('coordinates');
        if coords: reason='localisation_communale_approximative:' + reason
    return dict(precision=precision,coordinates=coords,score=round(score,4),
                matched_label=label,reason=reason,commune=commune)

def pilot(rows,ref,db):
    parsed=[parse(r,ref) for r in rows]
    rng=random.Random(20062024)
    groups=collections.defaultdict(list)
    for i,p in enumerate(parsed): groups[p['stratum']].append(i)
    selection=set()
    for k,indices in groups.items(): selection.update(rng.sample(indices,min(12,len(indices))))
    # Include all overseas, each year and category, and early documentary records.
    for key in ['Categorie','year']:
        values=collections.defaultdict(list)
        for i,r in enumerate(rows): values[r['Date de vente'][:4] if key=='year' else r[key]].append(i)
        for indices in values.values(): selection.add(rng.choice(indices))
    selection.update(i for i,p in enumerate(parsed) if p['cp'].startswith(('97','98')))
    selection.update([0,1,6,18])
    indices=sorted(selection)
    results=geocode([parsed[i] for i in indices],db)
    output=[]
    for i in indices:
        p=parsed[i]; g=classify(p,results.get(p['key']),ref)
        output.append(dict(line=i+2,year=rows[i]['Date de vente'][:4],category=rows[i]['Categorie'],
                           stratum=p['stratum'],address=rows[i]['Adresse'],**{k:v for k,v in g.items() if k!='commune'}))
    dump(ROOT/'reports/pilot.json',{'seed':20062024,'size':len(output),'records':output,
                                  'precision':dict(collections.Counter(r['precision'] for r in output))})
    with (ROOT/'reports/pilot.csv').open('w',encoding='utf-8',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(output[0])); writer.writeheader(); writer.writerows(output)
    print(json.dumps({'size':len(output),'precision':dict(collections.Counter(r['precision'] for r in output))},ensure_ascii=False))

def build(rows,ref,db):
    results=cached(db); records=[]; anomalies=[]
    organizers={r['Organisateur_id']:r['Organisateur_nom'] for r in rows}
    communes={}; address_table={}; addresses=[]; similar=collections.Counter(
        tuple(clean(r[k]).casefold() for k in ['Date de vente','Organisateur_id','Categorie','Adresse']) for r in rows)
    levels=collections.Counter(); reasons=collections.Counter(); unrequested=0
    for i,r in enumerate(rows):
        p=parse(r,ref); g=classify(p,results.get(p['key']),ref)
        year=int(r['Date de vente'][:4])
        if not 2006<=year<=2024:
            anomalies.append(dict(line=i+2,**r)); continue
        if p['query'] and p['key'] not in results: unrequested+=1
        c=g['commune']; code=c['code'] if c else ''; dep=c['codeDepartement'] if c else ''
        if c: communes[code]=dict(name=c['nom'],dep=dep,center=c.get('centre',{}).get('coordinates'))
        if r['Adresse'] not in address_table:
            address_table[r['Adresse']]=len(addresses); addresses.append(r['Adresse'])
        key=tuple(clean(r[k]).casefold() for k in ['Date de vente','Organisateur_id','Categorie','Adresse'])
        # Store each observation once, with address and organizer dictionaries.
        record=dict(id=int(re.search(r'_(\d+)$',r['Url'])[1]),date=r['Date de vente'],year=year,
                    category=r['Categorie'] or 'unknown',address=address_table[r['Adresse']],url=r['Url'],
                    organizer=r['Organisateur_id'],commune=code,dep=dep,precision=g['precision'],
                    coordinates=[round(v,6) for v in g['coordinates']] if g['coordinates'] else None,
                    score=g['score'],reason=g['reason'],similar=similar[key]>1,origin=p['origin'])
        records.append(record); levels[g['precision']]+=1; reasons[g['reason']]+=1
    agg=collections.Counter((r['year'],r['category'],r['dep'],r['commune'],r['precision']) for r in records)
    audit=dict(source=SOURCE.name,sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),bytes=SOURCE.stat().st_size,
               source_rows=len(rows),valid_rows=len(records),anomalies=len(anomalies),columns=list(rows[0]),
               missing={k:sum(not r[k].strip() for r in rows) for k in rows[0]},
               exact_duplicates=len(rows)-len(set(tuple(r.values()) for r in rows)),
               unique_urls=len(set(r['Url'] for r in rows)),potential_groups=sum(v>1 for v in similar.values()),
               potential_rows=sum(v for v in similar.values() if v>1),
               years=dict(sorted(collections.Counter(r['year'] for r in records).items())),
               precision=dict(levels),reasons=dict(reasons),without_department=sum(not r['dep'] for r in records),
               without_commune=sum(not r['commune'] for r in records),unrequested=unrequested,
               prepared_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),geocoder=API,version=VERSION)
    dump(ROOT/'reports/audit.json',audit); dump(ROOT/'reports/anomalies.json',anomalies)
    dump(ROOT/'app/data/atlas.json',dict(records=records,addresses=addresses,organizers=organizers,
         communes=communes,departments=ref.dep_names,categories={k or 'unknown':v for k,v in LABELS.items()},
         audit=audit,aggregates=[[*k,v] for k,v in agg.items()]))
    # Stable simplified departmental shapes, no synthetic property positions.
    for f in ref.departments['features']: f['id']=f['properties']['code']
    dump(ROOT/'app/data/departements.geojson',ref.departments)
    dump(ROOT/'app/data/anomalies.json',anomalies)
    dump(ROOT/'app/data/pilot.json',json.loads((ROOT/'reports/pilot.json').read_text()))
    print(json.dumps(audit,ensure_ascii=False,indent=2))

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('phase',choices=['pilot','geocode','build'])
    parser.add_argument('--batch-size',type=int,default=400); args=parser.parse_args()
    active=ROOT/'app/data/atlas.json'
    if active.exists() and json.loads(active.read_text()).get('audit',{}).get('dataset')=='licitor':
        raise SystemExit('ATLAS utilise Licitor. Préparation active : python3 scripts/prepare_licitor.py. Cette ancienne préparation ne peut pas écraser la nouvelle base.')
    ref=Reference(); rows=load_source(); db=connect()
    if args.phase=='pilot': pilot(rows,ref,db)
    elif args.phase=='geocode':
        if not (ROOT/'reports/pilot-reviewed.md').exists(): raise SystemExit('Examiner le pilote et rédiger reports/pilot-reviewed.md avant le traitement complet.')
        geocode([parse(r,ref) for r in rows if 2006<=int(r['Date de vente'][:4])<=2024],db,args.batch_size)
    else: build(rows,ref,db)
    db.close()

if __name__=='__main__': main()
