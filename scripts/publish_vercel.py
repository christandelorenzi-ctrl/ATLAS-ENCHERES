#!/usr/bin/env python3
"""Fabrique la copie en ligne d'ATLAS (hosting/atlas-vercel/public) à partir de app/.

app/ est la seule version à modifier. Ce script la recopie telle quelle, sauf
app/data/atlas.json, découpé en morceaux pour respecter les limites de taille
de l'hébergement. Il ne publie rien : l'envoi en ligne se fait ensuite avec git push
depuis hosting/atlas-vercel.
"""
import json, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'app'
PUBLIC = ROOT / 'hosting/atlas-vercel/public'
CHUNK_SIZE = 20000  # nombre de biens par morceau de données

# Fichiers recopiés à l'identique.
COPIED_FILES = ['index.html', 'style.css', 'app.mjs', 'stats.mjs',
                'data/departements.geojson', 'data/anomalies.json', 'data/pilot.json']
COPIED_FOLDERS = ['vendor']


def dump(path, value):
    """Écrit un JSON compact, au même format que scripts/prepare_licitor.py."""
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


def main():
    if not (APP / 'data/atlas.json').exists():
        raise SystemExit('Données absentes : lancer d’abord python3 scripts/prepare_licitor.py')
    if not PUBLIC.parent.is_dir():
        raise SystemExit(f'Dossier de publication introuvable : {PUBLIC.parent}')

    (PUBLIC / 'data').mkdir(parents=True, exist_ok=True)
    for name in COPIED_FILES:
        shutil.copyfile(APP / name, PUBLIC / name)
    for name in COPIED_FOLDERS:
        shutil.copytree(APP / name, PUBLIC / name, dirs_exist_ok=True)

    # Les biens partent dans des fichiers séparés ; atlas.json garde tout le reste
    # et la liste des morceaux, que app/app.mjs recharge et recolle.
    data = json.loads((APP / 'data/atlas.json').read_text(encoding='utf-8'))
    records = data.pop('records')
    chunk_names = []
    for start in range(0, len(records), CHUNK_SIZE):
        name = f'licitor-records-{len(chunk_names) + 1}.json'
        dump(PUBLIC / 'data' / name, records[start:start + CHUNK_SIZE])
        chunk_names.append(name)
    data['recordChunks'] = chunk_names
    dump(PUBLIC / 'data/atlas.json', data)

    # Supprime d'anciens morceaux devenus inutiles si la base a rétréci.
    for old in (PUBLIC / 'data').glob('licitor-records-*.json'):
        if old.name not in chunk_names:
            old.unlink()

    print(f'Copie en ligne prête : {len(records)} biens en {len(chunk_names)} morceaux dans {PUBLIC}')
    print('Pour publier : cd hosting/atlas-vercel && git add . && git commit -m "…" && git push')


if __name__ == '__main__':
    main()
