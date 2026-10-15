"""Offline reparse of every cached canonical hearing page, preserving lot entries."""
import csv,gzip,hashlib,json,re,sqlite3
from collections import Counter
from urllib.parse import urljoin,urlsplit,parse_qs
from census import anchors,text
from summarize_walk import OUT,ROOT,norm

def main():
 ref=json.loads((ROOT/'data/reference/communes.json').read_text());modern={r['code']:r for r in ref};names={};historic={}
 for r in ref:names.setdefault((r['codeDepartement'],norm(r['nom'])),set()).add(r['code'])
 for f in json.load(gzip.open(OUT/'communes_2018.geojson.gz'))['features']:
  r=f['properties']
  if r['code'] in modern:historic.setdefault((r['departement'],norm(r['nom'])),set()).add(r['code'])
 def locate(city,dep):
  candidates=names.get((dep,norm(city)),set());reason='nom_actuel_exact'
  for d,n,code in [('75','paris','75056'),('69','lyon','69123'),('13','marseille','13055')]:
   if dep==d and re.fullmatch(n+r'\d*(?:er|eme|e)?',norm(city)):candidates={code};reason=n+'_commune'
  if len(candidates)!=1:candidates=historic.get((dep,norm(city)),set());reason='nom_historique_2018_code_conserve'
  return (next(iter(candidates)),reason) if len(candidates)==1 else ('','commune_a_verifier')
 c=sqlite3.connect(OUT/'archive_walk.sqlite');rows=[];courts=Counter();hist=0;future=0
 for page,z in c.execute("select url,html from pages where state='done' order by url"):
  if 'month=' in page or 'year=' in page:continue
  position=0
  for attrs,body in anchors(gzip.decompress(z).decode(errors='replace')):
   if not re.search(r'class="Ad(?:\s|\")',attrs):continue
   position+=1;href=re.search(r'href="([^"]+)"',attrs)[1];aid=re.search(r'/(\d+)\.html$',href)[1]
   def extract(cls):
    m=re.search(r'<(?:span|p) class="'+cls+r'">(.*?)</(?:span|p)>',body,re.S)
    return text(m[1]) if m else ''
   city,dep,nature,description=[extract(k) for k in ['City','Number','Name','Text']]
   code,reason=locate(city,dep);archive='Archives' in attrs
   hist+=archive;future+=not archive;court=page.split('/')[4];courts[(court,archive)]+=1
   imm=bool(re.search(r'parts? sociales?|fonds de commerce|droits? sociaux|fonds artisanal',nature,re.I))
   centre=modern[code].get('centre',{}).get('coordinates',[]) if code else []
   rows.append(dict(entree_audience_id=hashlib.sha256((page+'#'+str(position)).encode()).hexdigest()[:20],
    annonce_id=aid,url=urljoin('https://www.licitor.com',href),source_audience=page,position_page=position,
    historique=archive,commune_source=city,departement_source=dep,nature=nature,description_publiee=description,
    code_insee=code,precision='commune_approximative' if code else 'a_verifier',justification=reason,
    longitude_centre_commune=centre[0] if len(centre)==2 else '',latitude_centre_commune=centre[1] if len(centre)==2 else '',
    bien_immateriel_a_isoler=imm))
 fields=list(rows[0])
 with (OUT/'lots_audiences.csv').open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
 recon=[]
 for r in csv.DictReader((OUT/'juridictions.csv').open(encoding='utf-8-sig')):
  court=r['url'].split('/')[4];observed=courts[court,True]
  recon.append(dict(juridiction=r['label'],url=r['url'],compteur_historique=int(r['count']),entrees_historiques=observed,
   difference=observed-int(r['count']),entrees_futures=courts[court,False]))
 with (OUT/'rapprochement_compteurs.csv').open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(recon[0]));w.writeheader();w.writerows(recon)
 result=dict(entrees_audiences=len(rows),historique=hist,a_venir=future,identifiants_annonces=len({r['annonce_id'] for r in rows}),
  communes_resolues=sum(bool(r['code_insee']) for r in rows),non_resolues=sum(not r['code_insee'] for r in rows),
  actifs_immateriels=sum(r['bien_immateriel_a_isoler'] for r in rows),
  entrees_immobilieres_localisables_commune=sum(bool(r['code_insee']) and not r['bien_immateriel_a_isoler'] for r in rows),
  juridictions=len(recon),juridictions_compteurs_exacts=sum(r['difference']==0 for r in recon),
  note='Une entrée est une ligne de bien/lot publiée dans une audience. Ni unicité du bien physique ni transaction réalisée ne sont établies.')
 assert len({r['entree_audience_id'] for r in rows})==len(rows)
 assert result['communes_resolues']+result['non_resolues']==len(rows)
 assert all(-180<=float(r['longitude_centre_commune'])<=180 and -90<=float(r['latitude_centre_commune'])<=90 for r in rows if r['code_insee'])
 (OUT/'lot_counts.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False))
if __name__=='__main__':main()
