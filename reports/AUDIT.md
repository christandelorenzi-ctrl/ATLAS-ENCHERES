# Rapport d’audit — ATLAS

Analyse de l’ensemble du fichier réel `resultats-vente-2006-2024.csv`.
Diagnostic initial validé par l’utilisateur ; préparation finalisée le 9 octobre 2026.

## Structure et unité statistique

- 3 402 609 octets ; UTF-8, virgules, guillemets CSV, six champs par observation.
- 14 550 enregistrements ; 35 adresses contiennent des retours à la ligne internes.
- 135 organisateurs ; correspondance identifiant / nom sans contradiction.
- 14 550 URL distinctes et identifiants numériques distincts.
- Une observation = une annonce source. Le fichier ne prouve pas une adjudication,
  ne distingue pas lots / audiences / tentatives, et ne contient pas de prix ou surface.

Empreinte SHA-256 source : `547f4f797ca4e54a5d55fc078c3af21545f66870707e37b015bc489846e4a500`.
Le CSV n’a pas été modifié.

## Qualité et couverture

245 adresses absentes ; trois catégories absentes ; aucune date, URL ou donnée
d’organisateur manquante. Toutes les dates sont valides au sens du calendrier.
Deux dates hors période (1968 et 1985) sont conservées dans `anomalies.json`,
hors des filtres et statistiques. Période valide : 8 mars 2006–15 octobre 2024.
2024 est partielle. Aucune exhaustivité nationale présumée.

| Année | Annonces |
|---|---:|
| 2006 | 11 |
| 2007 | 13 |
| 2008 | 32 |
| 2009 | 20 |
| 2010 | 95 |
| 2011 | 391 |
| 2012 | 511 |
| 2013 | 603 |
| 2014 | 1 416 |
| 2015 | 1 282 |
| 2016 | 1 191 |
| 2017 | 1 396 |
| 2018 | 1 309 |
| 2019 | 1 668 |
| 2020 | 922 |
| 2021 | 845 |
| 2022 | 943 |
| 2023 | 1 072 |
| 2024 | 828 |

## Similarités et conservation

Aucun doublon exact. 665 observations supplémentaires partagent les mêmes cinq
champs hors URL avant normalisation. Après réduction des espaces internes et
uniformisation de la casse : 491 groupes potentiellement similaires, comprenant
1 163 annonces. Ce contrôle affine le diagnostic initial, dont la normalisation
ne réduisait pas les espaces internes. **Aucune suppression.** Les mêmes adresses,
dates et catégories peuvent correspondre à plusieurs lots réellement distincts.

## Adresses avant géocodage

Après normalisation légère des espaces (texte original conservé) :

| Information observable | Nombre |
|---|---:|
| Nombre dans l’adresse, code postal et commune | 11 295 |
| Voie / lieu-dit sans nombre, code postal et commune | 1 533 |
| Commune et code postal uniquement | 1 466 |
| Vide | 245 |
| Atypique | 11 |

Un nombre peut être une date dans le nom de voie, un numéro de résidence ou une
plage, et ne prouve pas un numéro de bâtiment. Dix adresses atypiques n’ont pas
de code postal ; une adresse réunionnaise place le code postal après la commune.
11 766 adresses non vides distinctes après réduction des espaces et casse Unicode.

## Géocodage testé puis exécuté

Le [pilote](pilot-reviewed.md) couvre 112 observations, soit 108 requêtes uniques.
Il précède le traitement complet et compare les libellés source / IGN acceptés.
Les résultats ne mesurent pas une précision cadastrale ou une erreur métrique.

Le service [IGN Géoplateforme](https://data.geopf.fr/geocodage/openapi) a traité
les requêtes par lots CSV de 400 maximum. Réponses persistantes dans SQLite.
11 840 requêtes uniques pour la période valide ; le cache inclut aussi les cas
du pilote. Aucune requête non traitée dans la préparation finale, aucune erreur
serveur finale en cache ; réponses sans résultat conservées.

Les règles contrôlent : numéro concordant, score, écart entre candidats,
code postal, commune ou ancien nom déclaré par l’IGN, coordonnées valides et
position dans le contour départemental. Aucun département n’est déduit de
l’organisateur. Les adresses multiples sont rétrogradées au niveau communal.
Les centres communaux proviennent du référentiel officiel et sont toujours
étiquetés comme approximatifs. Les adresses absentes peuvent contribuer à la
commune si leur segment géographique d’URL correspond de façon unique au
référentiel. Les codes postaux seuls ne suffisent pas à choisir une commune.

| Précision finale (14 548 dates valides) | Nombre | Part |
|---|---:|---:|
| Adresse acceptée | 8 562 | 58,85 % |
| Rue / lieu-dit approximatif | 2 343 | 16,11 % |
| Commune approximative | 3 328 | 22,88 % |
| Non résolue | 315 | 2,17 % |

97 départements sont représentés après résolution. Les 315 annonces sans commune
identifiée n’ont pas de département attribué. Elles restent dans le total global,
mais ne sont pas dessinées. Les 14 233 autres sont localisées à un niveau ou un autre.
Le département dominant dans la base préparée est la Seine-Saint-Denis :
1 744 annonces, soit environ 12,0 % des 14 548 annonces valides.

Les scores ne sont pas des probabilités. Le contour simplifié peut rejeter un
point situé près d’une limite. L’usage de communes actuelles et de contours
départementaux 2024 ne reconstitue pas les changements historiques. Les noms
anciens non concordants restent non résolus. Le géocodage strict réduit les
faux placements au prix d’une couverture à l’adresse moins élevée.

## Interprétation cartographique

Chaleur : les seuls 8 562 résultats acceptés à l’adresse, poids égal au nombre
d’annonces distinctes à la position, sans points artificiels. Rue et commune
sont exclues. Densité relative au zoom, pas une mesure uniforme de volume.

Points : adresse et rue sont regroupées avec une somme des annonces ; les
positions communales sont dessinées séparément au zoom 7+, en cercles creux
et avec `≈`. Les annonces coïncidentes sont listées sans perte d’observations.

Départements : comptage de toutes les annonces au département identifié,
y compris au niveau communal. Seuils fixes 0 / 1 / 50 / 150 / 300 / 600 / 1 200.
Les parts utilisent toutes les annonces de la sélection, non attribuées incluses.
Les classements indiquent les effectifs géographiques manquants.

La carte répond à la distribution des annonces dans la base, pas aux prix, au
nombre national d’adjudications réalisées ni à une mesure de liquidation judiciaire.

## Sources géographiques

- [Communes, codes postaux, centres et départements officiels](https://geo.api.gouv.fr/decoupage-administratif/communes), snapshot téléchargé le 9 octobre 2026.
- [Contours Etalab / ADMIN EXPRESS 2024](https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/2024/geojson/), généralisation à 1 000 m.
- [Service IGN de géocodage](https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/geocodage/).
- Fond OpenStreetMap atténué, attributions visibles, bibliothèque MapLibre locale.

Les empreintes des référentiels sont enregistrées dans `data/reference/sources.json`.
Les effectifs et motifs techniques détaillés sont dans `audit.json`.
