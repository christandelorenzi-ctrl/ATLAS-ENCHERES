# ATLAS — Cartographie des annonces d’enchères immobilières en France

L’application utilise exclusivement le recensement Licitor achevé le 14 octobre 2026.
Son interface, ses trois modes cartographiques, filtres et classements sont conservés.

## Lancer sur Mac

Double-cliquer sur `Lancer-ATLAS.command`, ou depuis ce dossier :

```sh
python3 scripts/serve.py
```

Ouvrir http://127.0.0.1:8765/ et recharger la page si elle était déjà ouverte.
Le serveur écoute uniquement sur ce Mac ; aucun compte ni service payant obligatoire.
Le fond OpenStreetMap et les glyphes nécessitent Internet, les données et la bibliothèque
MapLibre sont locales. Ctrl+C arrête le serveur.

## Base active

- 87 811 entrées de biens/lots, 80 591 identifiants d’annonce.
- 87 337 entrées historiques et 474 à venir.
- 85 232 entrées localisables approximativement au centre officiel de leur commune.
- 2 479 communes non résolues ; 117 actifs immatériels repérés. Ces catégories se chevauchent.
- Aucun point pour les actifs immatériels ; 2 579 entrées n’ont pas de point cartographique.
- Période principale 1999–2026 ; 2026 partielle, incluant des audiences à venir.
- Une date atypique 1982 est conservée dans le total global, hors du graphique et des périodes restreintes.

Une observation est une entrée publiée dans une audience, pas un bien physique unique
ou une transaction réalisée. Des lots distincts partagent parfois la même URL : ils
sont conservés. Les anciennes 14 548 annonces ne sont plus chargées ni additionnées.
Leur source et une sauvegarde se trouvent hors de l’application active, pour traçabilité.

Les trois modes :

- Chaleur : concentrations communales approximatives, pondération par racine carrée des volumes pour limiter la saturation, zoom territorial seulement. Dès le zoom 9, repères ≈ à la place de la chaleur. Aucune densité artificielle de rues ou quartiers.
- Points regroupés : centres de communes, nombres d’entrées pondérés dans les clusters ; infobulles avec nature publiée, date annoncée, organisateur et URL Licitor.
- Départements : toutes les entrées avec département fiable, seuils fixes documentés dans la légende et la méthodologie.

La courbe annuelle sous la carte affiche un point par année de 1999 à 2026. Survol ou focus : effectif ; clic : filtre annuel. Le segment de 2026 est en pointillés car l’année est partielle. La date atypique de 1982 est exclue de cette courbe.

Les filtres, le classement, la courbe et l’export utilisent exactement la même sélection.
Les catégories regroupent la nature textuelle publiée ; elles ne certifient pas des caractéristiques absentes.

## Repréparer sans réseau

Python 3.9 ou ultérieur, bibliothèque standard uniquement :

```sh
python3 scripts/prepare_licitor.py
```

Entrée : `licitor_audit/lots_audiences.csv`. Sortie active : `app/data/atlas.json`,
avec dictionnaires de communes, natures, audiences, localisations et agrégations.
Le script ne lance aucune collecte ni géocodage.
L’ancienne préparation `scripts/prepare.py` refuse d’écraser une base Licitor active.

Les preuves, le cache et le rapport détaillé du recensement sont dans `licitor_audit/`.
La sauvegarde de l’ancienne base est dans `data/archive/`, non servie au navigateur.

## Contrôles

```sh
python3 -m unittest discover -s tests
node tests/stats.test.mjs
```

Ils vérifient la concordance avec le CSV réel, les lots, les coordonnées communales,
la date atypique, les actifs immatériels et les filtres / agrégations.
`tests/browser.mjs` effectue les contrôles WebGL et visuels avec Playwright et Chrome,
si disponibles. Mesures et captures : `reports/browser-validation.json` et `reports/screenshots/`.

La distribution décrit uniquement la base observée ; elle n’est pas extrapolée à toutes
les adjudications françaises. Les adresses individuelles et les résultats d’adjudication
ne sont pas encore audités exhaustivement.
