"""Consistency checks of observed counts and conservative commune coordinates."""
import csv,json,math
from pathlib import Path
P=Path(__file__).resolve().parent
rows=list(csv.DictReader((P/'lots_audiences.csv').open(encoding='utf-8-sig')))
c=json.loads((P/'lot_counts.json').read_text())
r=list(csv.DictReader((P/'rapprochement_compteurs.csv').open(encoding='utf-8-sig')))
assert len(rows)==c['entrees_audiences']==87811
assert len({v['entree_audience_id'] for v in rows})==len(rows)
assert len({v['annonce_id'] for v in rows})==c['identifiants_annonces']==80591
assert sum(v['historique']=='True' for v in rows)==c['historique']==87337
assert sum(v['historique']=='False' for v in rows)==c['a_venir']==474
assert len(r)==167 and all(int(v['difference'])==0 for v in r)
assert sum(int(v['entrees_historiques']) for v in r)==87337
assert sum(int(v['entrees_futures']) for v in r)==474
assert sum(bool(v['code_insee']) for v in rows)==c['communes_resolues']
assert sum(not v['code_insee'] for v in rows)==c['non_resolues']
assert sum(bool(v['code_insee']) and v['bien_immateriel_a_isoler']=='False' for v in rows)==c['entrees_immobilieres_localisables_commune']
for v in rows:
 assert v['url'].startswith('https://www.licitor.com/annonce/')
 assert '/ventes-judiciaires-immobilieres/' in v['source_audience']
 if v['code_insee']:
  x,y=float(v['longitude_centre_commune']),float(v['latitude_centre_commune'])
  assert math.isfinite(x) and math.isfinite(y) and -180<=x<=180 and -90<=y<=90
  assert v['precision']=='commune_approximative'
 else:assert not v['longitude_centre_commune'] and not v['latitude_centre_commune']
print('OK : 87 811 entrées, 80 591 identifiants, 167 compteurs concordants, coordonnées communales valides.')
