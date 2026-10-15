# Validation finale — 9 octobre 2026

Application réellement lancée sur ce Mac : `http://127.0.0.1:8765`.
Contrôles automatisés dans Google Chrome avec un profil Playwright temporaire.
Les captures ont été examinées : chaleur, points, départements filtrés,
méthodologie, écran de portable et tablette. Les données sont celles du CSV fourni.

## Statistiques et préparation

- Huit tests Python réussis : empreinte source inchangée, conservation des URL,
  partition 14 548 annonces + deux anomalies, rapprochement des années et catégories
  avec le CSV, cube d’agrégations, coordonnées et précision, cache complet et pilote.
- 155 scénarios JavaScript réussis : années, catégories, départements, recherches,
  combinaisons de filtres, états vides, sommes des agrégations et des poids géographiques.
- Aucun point non résolu dessiné ; coordonnées finies et dans les bornes WGS84.
- Les deux dates anormales sont conservées mais exclues des statistiques.
- Toutes les observations potentiellement similaires sont conservées.

## Contrôles du navigateur

1. Fond OpenStreetMap réellement chargé, MapLibre WebGL initialisé, 14 548 annonces.
2. Mode chaleur visible, seuls les résultats acceptés à l’adresse contribuent.
3. Points regroupés visibles ; clic sur un groupe augmente le zoom.
4. Clic sur une adresse réelle de Paris : infobulle non vide, texte et lien source.
5. Clic sur une position communale : infobulle explicitement approximative.
6. Mode départemental ; filtre 2019 + appartements + Seine-Saint-Denis :
   134 annonces, égalité entre données filtrées, indicateur et état de la couche départementale.
7. Recherche Paris et Seine-Saint-Denis, sélection inexistante à zéro,
   réinitialisation au total de 14 548. La recherche accepte noms et codes.
8. Top 10 communes, clic sur le premier territoire : centrage et zoom.
9. Navigation vers La Réunion : carte effectivement déplacée dans l’hémisphère sud.
10. Méthodologie accessible, bilan de précision affiché, téléchargement CSV déclenché.
11. Affichage à 1280 × 800 et 820 × 1180 : aucun débordement horizontal.
12. Aucune erreur JavaScript ; aucun échec réseau final autre que les annulations
    normales de requêtes de tuiles devenues inutiles lors des déplacements rapides.

Les screenshots sont dans `reports/screenshots/` (non versionnés par défaut).
Le rapport machine est `browser-validation.json` ; le script de reproduction
est `tests/browser.mjs`. Le premier fond CARTO a été écarté après constat visuel
d’un filigrane imposant une clé. Le fond livré est OpenStreetMap sans clé.

## Performance réellement mesurée

Trois chargements du fichier complet, dans le même contexte navigateur :

| Chargement | Premier affichage utile depuis la navigation | Initialisation du module |
|---|---:|---:|
| Premier | 778 ms | 673 ms |
| Deuxième | 587 ms | 486 ms |
| Troisième | 490 ms | 442 ms |

Le premier affichage utile est mesuré avec l’horloge de navigation du navigateur,
jusqu’au premier événement MapLibre `idle` après l’ajout des couches et données.
Il inclut HTML, bibliothèque, données, traitement, fond et rendu initial. Les
deux chargements suivants bénéficient du cache navigateur / réseau. Le fond
était chargé à chacune des trois mesures. Budget sous trois secondes satisfait
sur cette machine et ce réseau, sans garantie sur une connexion lente.

Données principales : 7 188 141 octets bruts, 984 084 octets gzip (niveau 5).
Le serveur prépare la compression en mémoire et réutilise cette réponse avec
ETag. Les calculs de filtres observés sont de l’ordre de quelques millisecondes
à une vingtaine de millisecondes ; ce chiffre ne mesure pas toute la durée du
rafraîchissement graphique dans les workers.

## Limites de la validation

Chrome a été contrôlé ; Safari, Firefox, les gestes tactiles d’une tablette
physique et les liens historiques externes n’ont pas été testés individuellement.
Les vues tablette sont des émulations de taille d’écran. Le fond et les glyphes
sont distants ; leur disponibilité n’est pas garantie. Les statistiques et
contours sont locaux. La précision des biens est contrôlée par concordance
documentaire / géographique, sans vérification cadastrale ou terrain.

Les coordonnées de tribunal ne sont jamais utilisées par le script de préparation.
Les résultats sont exclusivement des annonces observées dans la base étudiée.
