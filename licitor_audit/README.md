# Recensement Licitor indépendant d’ATLAS

Collecte commencée le 13 octobre 2026, terminée le 14 octobre 2026 heure de Paris.
L’application ATLAS n’a pas été modifiée.

Résultat : 87 811 entrées de biens/lots dans les listes d’audiences publiques,
80 591 identifiants d’annonce. 85 232 entrées sont localisables approximativement
à la commune, hors actifs immatériels explicitement repérés.

Voir RAPPORT.md pour la méthode, les limites et les distinctions statistiques.

## Fichiers

- `lots_audiences.csv` : toutes les entrées publiées, conservées même si elles partagent une URL ; coordonnées du centre officiel de la commune uniquement.
- `annonces_localisables.csv` : une ligne par identifiant d’annonce, première localité observée ; ne représente pas exhaustivement les localités des annonces multi-lots.
- `rapprochement_compteurs.csv` : contrôle des 167 compteurs historiques, tous concordants.
- `archive_walk.sqlite` : cache HTML compressé, annonces et file de parcours.
- `lot_counts.json`, `locality_counts.json`, `FINAL_RESULT.json` : décomptes vérifiables.
- `census.json`, `juridictions.csv`, `zones.csv` : compteurs initiaux des index.

## Reproduire hors ligne

Python 3.9 ou ultérieur, bibliothèque standard uniquement :

```sh
python3 licitor_audit/audit_lots.py
python3 licitor_audit/summarize_walk.py
python3 licitor_audit/check_counts.py
```

Ces commandes relisent exclusivement les preuves mises en cache.

`walk_archives.py` reprend la file des pages d’audience depuis le cache :
une requête à la fois, départs espacés d’au moins 1,2 seconde. Le cache complet
actuel ne provoque aucune nouvelle requête. Ce programme ne lit pas massivement
les fiches individuelles et n’accède pas aux chemins interdits par robots.txt.
Il s’arrête sur restrictions HTTP 401/403/429 ou protection technique.
