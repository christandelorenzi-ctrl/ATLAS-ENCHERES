# Vérification préalable du géocodage — 9 octobre 2026

112 observations réelles, 108 requêtes distinctes ; tirage déterministe (graine 20062024).
Le pilote couvre les six strates d’adresses, toutes les années et catégories présentes,
les sept adresses au format postal ultramarin, et l’adresse atypique de La Réunion.
Il surreprésente volontairement les cas difficiles : ses proportions ne sont pas
une estimation du taux de géocodage de l’ensemble du fichier.

Résultats : 28 à l’adresse, 18 à la rue / au lieu-dit, 62 à la commune,
4 non résolus. Sur les 35 adresses de la strate numérotée : 27 à l’adresse,
2 à la rue et 6 à la commune. Les 12 adresses multiples ne sont jamais
acceptées comme un emplacement exact.

Examen des libellés source / IGN de tous les résultats à l’adresse ou à la rue :
numéros, voie, commune et code postal cohérents dans les exemples acceptés.
Exemples : 38 rue de l’Hôtel de Ville à Mazères ; 3 place Vauban à Paris ;
12 rue du Maine à Saint-Denis (97490). Le contour du département est également
vérifié pour les positions IGN acceptées, avec un contour simplifié à 1 km.
Ce contrôle conservateur peut rejeter des points proches d’une frontière.

Le 8 rue Aimé Foulquier à Pia est rétrogradé à la commune (score 0,7061).
Le 15 route d’Echampeu à Lizy-sur-Ourcq est accepté à la rue seulement : l’IGN
ne retrouve pas le numéro. Le 6–8 rue de la Chaîne à Meulan reste non résolu
(nom historique non concordant avec le référentiel actuel).

Décision : traitement complet possible avec les mêmes règles conservatrices.
Adresse acceptée : score ≥ 0,85, écart avec le second résultat ≥ 0,05,
numéro présent, concordance commune / code postal, coordonnées dans le département.
Rue ou lieu-dit : score ≥ 0,75 et mêmes concordances géographiques.
Sinon, repli communal explicitement approximatif lorsqu’une commune a été
identifiée dans le référentiel officiel. Aucune adresse de tribunal n’est utilisée.

Limite : ce test mesure la concordance documentaire et géographique, pas la
position cadastrale réelle du bien ni la précision métrique. Pas de visite terrain
ou de vérification contre les actes historiques. Le score IGN n’est pas une
probabilité statistique. Les résultats communaux sont exclus de la chaleur fine,
comme les résultats à la rue et les adresses multiples.
