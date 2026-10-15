#!/usr/bin/env python3
"""Optional reference refresh; existing versions are retained unless --refresh is given."""
import argparse, datetime, hashlib, json, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
FILES={
 'communes.json':'https://geo.api.gouv.fr/communes?fields=code,nom,codesPostaux,codeDepartement,centre&format=json',
 'departements.geojson':'https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/2024/geojson/departements-1000m.geojson'
}
def main():
    p=argparse.ArgumentParser();p.add_argument('--refresh',action='store_true');args=p.parse_args();meta={}
    for name,url in FILES.items():
        path=ROOT/'data/reference'/name;path.parent.mkdir(parents=True,exist_ok=True)
        if not path.exists() or args.refresh:
            subprocess.run(['curl','-LsS','--fail','--max-time','90',url,'-o',str(path)],check=True)
        json.loads(path.read_text())
        meta[name]={'url':url,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    (ROOT/'data/reference/sources.json').write_text(json.dumps({'recorded_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':meta},indent=2),encoding='utf-8')
if __name__=='__main__':main()
