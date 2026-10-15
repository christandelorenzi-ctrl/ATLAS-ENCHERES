# Dictionnaire des données ATLAS

## Source

| Champ | Type lu | Définition / limite |
|---|---|---|
| Date de vente | Chaîne ISO 8601 UTC | Date annoncée ; ni réalisation ni adjudication démontrée. |
| Organisateur_id | Chaîne identifiant | Identifiant de l’organisateur, conservé sans conversion numérique. |
| Organisateur_nom | Chaîne | Tribunal ou autre organisateur ; jamais une adresse de bien. |
| Categorie | Chaîne catégorielle | Neuf catégories renseignées, trois manquantes codées `unknown` dans l’application. |
| Adresse | Chaîne | Localisation du bien ; peut contenir numéro, voie, lieu-dit, plusieurs rues, code postal, commune, pays, retours à la ligne. |
| Url | URL | Clé statistique unique ; suffixe numérique utilisé comme identifiant interne. |

Absents : prix d’adjudication, mise à prix, surface, statut final, numéro de lot explicite,
référence cadastrale, département et code INSEE structurés, coordonnées.

## Données préparées (`app/data/atlas.json`)

| Champ d’une observation | Définition |
|---|---|
| id / url | Identifiant numérique extrait du suffixe d’URL et URL source complète. |
| date / year | Date source et année UTC. Les deux années hors 2006–2024 sont isolées. |
| category | Catégorie source ou `unknown`. |
| address | Index dans le dictionnaire `addresses`, texte original conservé. |
| organizer | Clé dans `organizers`. |
| commune / dep | Codes INSEE et département issus du référentiel officiel, chaînes conservant les zéros initiaux. Vides si non identifiés. |
| precision | `adresse`, `rue`, `commune` ou `non_resolue`. |
| coordinates | Longitude puis latitude en WGS84 ; `null` si non résolue. Commune = centre administratif approximatif, jamais une adresse exacte. |
| score | Score brut IGN arrondi à quatre décimales, pas une probabilité. Peut être élevé même si la position précise est rejetée. |
| reason | Motif d’acceptation ou de repli, conservé dans l’export. |
| origin | `adresse` ou `commune_url` : provenance de la commune pour les adresses absentes. |
| similar | Appartenance à un groupe date + organisateur + catégorie + adresse normalisés ; indicateur de contrôle, pas preuve de doublon. |

Les dictionnaires `communes` et `departments` contiennent les libellés officiels.
`aggregates` contient des tuples `[année, catégorie, département, commune, précision, effectif]`.
`audit` conserve l’empreinte source, les effectifs, règles et date de préparation.

Le cache SQLite contient la requête, la réponse CSV IGN complète et l’horodatage UTC.
Les codes INSEE d’arrondissement de Paris, Lyon et Marseille sont rattachés à la commune.
Toutes les statistiques de l’interface comptent des annonces, jamais des ventes réalisées.
