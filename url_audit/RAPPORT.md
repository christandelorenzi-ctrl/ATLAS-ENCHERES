# ATLAS — Audit exploratoire des URL, arrêté après dix liens

## Conclusion immédiate

**Les dix URL examinées renvoient HTTP 403 et une page de protection Cloudflare.**
Aucun HTML d’annonce n’a pu être examiné : aucun prix, statut, surface, procédure
ou document supplémentaire n’a été récupéré. Ce résultat concerne l’accès automatisé
sans authentification testé ici ; il ne prouve ni disparition des annonces ni absence
des informations recherchées sur le site.

L’utilisateur a demandé une alerte si le premier lien bloquait, puis un arrêt après
dix liens. Cette consigne a été appliquée : premier blocage signalé immédiatement,
neuf autres URL vérifiées, puis arrêt. Les 90 autres URL de l’échantillon ne sont
pas examinées. **Aucune collecte sur les 14 550 URL, aucune modification d’ATLAS.**

## Échantillon reproductible

Le CSV original comporte 14 550 URL distinctes. Un échantillon de 100 URL a été
constitué, sans modification de la source. Le premier enregistrement du fichier
est imposé comme premier test, puis une sélection gloutonne privilégie la diversité
des attributs encore non couverts : catégorie (poids 9), période (8), année (4),
organisateur (2), département indiqué dans le segment géographique de l’URL (2).
Les ex æquo sont départagés par SHA-256 de la graine et de l’URL.

Graine : `ATLAS-URL-AUDIT-2026-10-09-v1`.
Périodes : dates anormales hors 2006–2024, 2006–2010, 2011–2015, 2016–2020,
2021–2024. L’échantillon de 100 couvre toutes les 21 années présentes dans le
fichier, y compris les deux années anormales, et les dix modalités de catégorie
(neuf renseignées et une absente), ainsi que 97 organisateurs et 90 codes
départementaux d’URL. Les couvertures exactes sont enregistrées dans `sampling.json`.

La référence `ligne_enregistrement` est le rang de l’enregistrement CSV, en
comptant l’en-tête comme ligne 1. Elle ne désigne pas une ligne physique de texte :
le fichier contient des cellules multiligne. L’identifiant d’annonce est le suffixe
numérique de l’URL. Tous ces identifiants sont conservés dans les fichiers livrés.

Il s’agit d’un échantillon intentionnel de couverture, **pas d’un tirage aléatoire
proportionnel**. Les biens et périodes rares sont surreprésentés. Les départements
d’URL servent uniquement à diversifier le prélèvement ; ils ne sont pas une nouvelle
validation de la localisation des biens. Le sous-échantillon effectivement vérifié
ne compte que dix observations : neuf de 2006–2024 et une date anormale (1985),
dont l’inclusion est explicitement signalée.

## Méthode d’accès et constat technique

Requêtes HTTPS GET ordinaires avec `curl`, sans session authentifiée, sans changement
d’identité de navigateur, sans proxy de contournement, sans résolution de challenge,
sans accès à une API cachée. Deux secondes entre les neuf requêtes supplémentaires,
25 secondes de délai maximal, trois redirections au maximum, aucun nouvel essai
après protection. La première réponse a été conservée, sans demander une seconde
fois la même annonce.

Les en-têtes et pages de protection sont archivés dans `pages/`. Chaque réponse
présente un HTTP 403 et les marqueurs Cloudflare, notamment le titre
`Just a moment...`. Le nombre de redirections observées est zéro pour les dix liens.
Le titre et les scripts de la protection ne sont pas interprétés comme métadonnées
du bien. Le HTML original de l’annonce, ses métadonnées, données structurées et
liens de documents restent inaccessibles ; ils ne sont pas présumés absents.

Le fichier public `robots.txt` a été consulté et conservé. Il exprime des restrictions
pour plusieurs robots et des signaux d’usage. Une autorisation de parcours générique
ne vaut pas autorisation générale de réutiliser une base ou de franchir la protection.
Les [CGU publiques du site](https://encheres-publiques.com/cgu) ont été identifiées.
Cet audit bloqué ne permet pas de conclure juridiquement qu’une extraction complète
serait autorisée. Aucune protection n’a été contournée.

## Tableau des résultats observés

Le dénominateur est **les dix URL réellement examinées**, jamais les 100 sélectionnées
ou les 14 550 URL du fichier. « Récupéré » signifie donnée supplémentaire vérifiable
obtenue lors de cet audit ; un zéro n’est pas une preuve d’absence sur le site.

| Indicateur | Nombre | Pourcentage sur les 10 examinées |
|---|---:|---:|
| Pages d’annonces accessibles par la méthode testée | 0 | 0 % |
| Pages d’annonces inaccessibles par cette méthode | 10 | 100 % |
| Blocages Cloudflare HTTP 403 | 10 | 100 % |
| Redirections observées | 0 | 0 % |
| Prix de mise à prix récupérés | 0 | 0 % |
| Prix d’adjudication récupérés | 0 | 0 % |
| Dates effectives d’adjudication récupérées | 0 | 0 % |
| Statuts de vente identifiables | 0 | 0 % |
| Informations de surenchère récupérées | 0 | 0 % |
| Surfaces supplémentaires récupérées | 0 | 0 % |
| Procédures juridiques identifiables | 0 | 0 % |
| Liquidations judiciaires explicitement identifiées | 0 | 0 % |
| Documents complémentaires accessibles et vérifiés | 0 | 0 % |

Les six champs déjà présents dans le CSV ne sont pas comptés comme nouvelles données
récupérées. Les 19 rubriques demandées ont toutes la fiabilité `inaccessible` pour
les dix liens examinés. Aucun prix de mise à prix n’est assimilé à un prix final,
aucun statut de vente n’est inféré de l’ancienneté et aucune liquidation n’est
déduite du nom du tribunal. Les 90 autres liens portent `non_examinee`.

Les catégories, années et URL de chaque test sont consultables dans `audit_10.csv`.
Il n’existe aucun exemple de page riche **observée dans cet échantillon**, puisque
le contenu des dix annonces n’a pas été reçu. Des résultats indexés ailleurs ne
remplaceraient pas cet examen et ne sont pas utilisés pour fabriquer des taux.

## Peut-on enrichir les 14 550 annonces ?

1. **Prix d’adjudication en proportion significative : indéterminé.** Aucun prix
   n’a pu être observé ; l’audit ne mesure pas leur disponibilité réelle.
2. **Ventes réalisées versus simples annonces : pas à partir de cet audit.** Il
   faudrait un statut explicite ou une pièce probante. Une annonce passée ne suffit pas.
3. **Liquidations judiciaires : indéterminé.** Un jugement ou une mention explicite
   serait nécessaire ; l’organisation par un tribunal ne suffit pas.
4. **Surfaces et comparaison DVF : indéterminé.** Il faudra relever surface et
   définition, nature, adresse, date et éventuellement parcelles. Des annonces
   portant sur plusieurs lots ne sont pas directement comparables à une mutation.
5. **Extension technique et juridique : non démontrée.** La méthode actuelle est
   bloquée. Une voie autorisée doit être obtenue auprès de l’éditeur : export,
   API documentée ou modalités convenues de consultation. Les conditions de collecte
   et de réutilisation doivent être clarifiées avant une extension.
6. **Taux exploitable estimé : aucune estimation défendable pour tout le fichier.**
   Le rendement observé de cette méthode est 0/10 (0 %), mais le blocage systématique
   et la sélection intentionnelle empêchent d’en déduire le taux de données présentes
   sur les pages. Aucun intervalle statistique de disponibilité nationale n’est calculé.

**À ce stade, ATLAS reste une base d’annonces ; sa transformation en base de transactions
judiciaires effectives n’est pas établie.** Ce constat est un résultat de faisabilité
d’accès, pas une conclusion sur le contenu éditorial du site.

## Stratégie progressive proposée, sans exécution supplémentaire

1. Demander à l’éditeur une modalité autorisée d’export ou d’accès aux anciennes
   annonces et aux résultats. Cette étape n’est ni déclenchée ni estimable en délai.
2. Si un accès autorisé devient disponible, reprendre les mêmes 100 identifiants,
   examiner les vrais contenus et leurs preuves, vérifier manuellement les prix
   finaux, statuts et procédures. Séparer les champs absents des champs réservés
   à un compte ou des pages disparues.
3. Évaluer le rendement par période, catégorie et organisateur. Les différences
   de gabarit et d’archivage demanderont des extracteurs contrôlés, avec source,
   extrait bref, date de collecte et niveau de fiabilité pour chaque champ.
4. Faire valider une extension par l’utilisateur, définir la cadence avec le site,
   mettre en cache et effectuer un contrôle manuel des données transactionnelles.

Repère de charge **conditionnel, pas un délai mesuré de collecte réussie** : à une
requête toutes les deux secondes, 100 pages demandent au minimum 3 min 20 s et
14 550 pages au minimum 8 h 05, hors latence, pauses, erreurs, documents et contrôle
humain. Chaque PDF ou sous-page ajouterait une requête. Le délai de nettoyage et
de vérification ne peut pas être estimé sans avoir obtenu de vraies annonces.
Avec le blocage actuel, étendre cette méthode ne serait pas une collecte productive.

Pour le mémoire, conserver cet audit comme preuve documentée d’une limitation
d’accès et conserver l’unité « annonce ». La constitution d’une base de transactions
nécessitera un accès autorisé aux résultats et une vérification de leur nature.

## Livrables

- `echantillon_100.csv` : 100 URL sélectionnées, identifiants et strates.
- `audit_10.csv` : les dix tests effectifs, preuves d’accès, rubriques et fiabilité.
- `audit_echantillon_100.csv` : 100 lignes, dix examinées et 90 non examinées,
  sans valeurs inventées ni résultat imputé aux pages non visitées.
- `sampling.json` : méthode, graine, empreinte source et couverture.
- `results.json`, `pages/*.headers`, `pages/*.html` : résultats et traces.
- `audit_urls.py` : script indépendant avec une limite codée de dix liens.

Fin de l’audit demandé ; aucune requête d’annonce au-delà de la dixième.
