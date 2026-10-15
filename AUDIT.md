# Audit pédagogique d'ATLAS

*Audit réalisé le 15 octobre 2026, à partir du code réel du projet. Aucun fichier n'a été modifié.*

---

## 1. Vue d'ensemble

### Ce que fait le projet

ATLAS affiche sur une carte de France les **87 811 biens immobiliers mis aux enchères** et annoncés sur le site Licitor entre 1999 et 2026. On peut filtrer par année, par type de bien et par département, voir un classement, une courbe annuelle, et exporter la sélection en fichier CSV (un tableau lisible par Excel).

### Les technologies utilisées

| Technologie | Son rôle dans ATLAS |
|---|---|
| **Python** | Prépare les données (transforme le gros tableau Licitor en un fichier lisible par la carte) et fait tourner le petit serveur local. |
| **JavaScript** | Le code qui s'exécute dans le navigateur : filtres, carte, graphiques, export. |
| **HTML / CSS** | La structure de la page (HTML) et son apparence : couleurs, tailles, mise en page (CSS). |
| **MapLibre** | Une bibliothèque gratuite qui dessine la carte interactive. |
| **OpenStreetMap** | Le fond de carte (routes, villes), téléchargé en direct sur Internet. |
| **Vercel** | L'hébergeur qui met le site en ligne. |

### Comment les fichiers s'articulent

```
 ÉTAPE 1 : collecte (déjà faite, le 14/10/2026)
 licitor_audit/lots_audiences.csv   ← le grand tableau brut des annonces
            │
            ▼
 ÉTAPE 2 : préparation (Python)
 scripts/prepare_licitor.py         ← nettoie, classe, calcule
            │
            ▼
 app/data/atlas.json  (54 Mo)       ← les données prêtes pour la carte
            │
            ├──────────────────────────────┐
            ▼                              ▼
 VERSION LOCALE (ton Mac)          VERSION EN LIGNE (Vercel)
 scripts/serve.py                  hosting/atlas-vercel/public/
   sert le dossier app/              = une COPIE de app/, données
            │                          découpées en 5 morceaux
            ▼                              │
 Navigateur : app/index.html  ◄────────────┘
            │
            ├── app/app.mjs    ← affichage : carte, filtres, graphiques
            └── app/stats.mjs  ← calculs : filtrer, compter, classer

 Contrôles : tests/test_data.py (Python) et tests/stats.test.mjs (JavaScript)
```

### Mini-lexique

- **Code en dur** : une valeur écrite directement dans le code (par exemple « 87811 ») au lieu d'être calculée. Il faut la changer à la main quand la réalité change.
- **Git / commit** : Git est un système qui garde l'historique de ton projet. Un *commit*, c'est un point de sauvegarde avec une petite description, vers lequel on peut revenir.
- **Fonction** : un petit bloc de code qui porte un nom et qui fait une tâche précise, comme une recette de cuisine qu'on peut réutiliser.
- **Variable** : une boîte avec un nom, qui contient une valeur.
- **Serveur** : un programme qui envoie les fichiers de la page au navigateur quand celui-ci les demande.
- **Requête** : une demande envoyée par le navigateur à un serveur (« donne-moi ce fichier »).
- **Dépendance** : un outil extérieur dont le projet a besoin pour fonctionner.
- **JSON** : un format de fichier texte pour stocker des données structurées, facile à lire pour un programme.
- **CSV** : un tableau en texte brut, que l'on ouvre dans Excel.
- **Test automatique** : un petit programme qui vérifie tout seul que le vrai programme donne les bons résultats.
- **Assertion (`assert`)** : une vérification dans le code qui arrête tout si une condition n'est pas remplie.
- **Échappement (`esc`)** : transformer les caractères spéciaux d'un texte pour qu'il soit affiché tel quel, et non interprété comme du code.

---

## 2. Les notes

| Critère | Note | Justification |
|---|---|---|
| **Sécurité** | 8/10 | Les textes venant des données sont neutralisés avant affichage et le serveur local refuse les accès extérieurs. Le point faible principal est la dépendance à des serveurs gratuits qui ne t'appartiennent pas. |
| **Fiabilité** | 6/10 | Les tests sont solides, mais il n'y a aucune sauvegarde Git et deux copies du code évoluent séparément. |
| **Lisibilité** | 4/10 | Le code est très compressé : plusieurs instructions par ligne, des noms d'une seule lettre, des lignes de plus de 600 caractères. |
| **Performance** | 6/10 | Les filtres sont rapides, mais le fichier de données est inutilement lourd et certains calculs sont faits trois fois. |
| **Maintenabilité** | 4/10 | Beaucoup de chiffres sont écrits en dur. La prochaine mise à jour des données demandera de modifier plusieurs endroits à la main. |

---

## 3. Les 10 problèmes, du plus grave au moins grave

### Problème 1 — Aucune sauvegarde de l'historique du projet

- **Où :** tout le projet (`git log` répond « does not have any commits yet »).
- **Le problème :** le dossier est prêt pour Git, mais aucun point de sauvegarde n'a jamais été créé.
- **Pourquoi c'est important :** c'est comme écrire un mémoire sans jamais enregistrer de version : une mauvaise manipulation, et le travail des jours précédents est perdu sans retour possible.
- **Ce qui pourrait arriver :** une IA (Codex ou Claude) modifie `app.mjs` et casse la carte. Sans sauvegarde, impossible de retrouver la version qui marchait hier.
- **La correction :**
  ```
  Avant : rien
  Après : git add .
          git commit -m "Version de référence d'ATLAS, 15/10/2026"
  ```
  Penser aussi à ajouter à `.gitignore` les gros fichiers bruts qu'on ne veut pas sauvegarder (par exemple `*.sqlite`).
- **Le concept à retenir :** **sauvegarde avant de modifier.** Avant chaque série de changements, fais un commit. C'est ton bouton « annuler » géant.
- **Difficulté :** facile.

---

### Problème 2 — Deux copies du code qui ne sont plus identiques

- **Où :** [app/app.mjs:324-326](app/app.mjs#L324-L326) et `hosting/atlas-vercel/public/app.mjs:326`.
- **Le problème :** la version en ligne contient une ligne de plus que la version locale. Il y a donc deux versions d'ATLAS qu'il faut maintenir séparément, à la main.
- **Pourquoi c'est important :** c'est comme avoir deux carnets d'adresses : tu ajoutes un contact dans l'un et tu oublies l'autre. Au bout d'un moment, tu ne sais plus lequel est juste.
- **Ce qui pourrait arriver :** tu corriges un bug sur ton Mac, tu le vérifies, tu es content… mais le site public garde le bug. Ou l'inverse : tu recopies `app/` vers Vercel et tu écrases la ligne qui charge les 5 morceaux de données. Le site public affiche alors une carte vide.
- **La correction :** n'avoir qu'**une seule** version du code, qui sait gérer les deux cas. La ligne en plus est déjà écrite pour ça : elle ne fait rien si les données ne sont pas découpées.
  ```js
  // Avant (app/app.mjs, version locale)
  [data,departments]=loaded;
  populate();...

  // Après (identique en local et en ligne)
  [data,departments]=loaded;
  if(data.recordChunks)data.records=(await Promise.all(data.recordChunks.map(name=>getJSON('data/'+name)))).flat();
  populate();...
  ```
  Ensuite, utiliser un petit script qui copie automatiquement `app/` vers la version en ligne, au lieu de le faire à la main.
- **Le concept à retenir :** **une seule source de vérité.** Une information ne doit exister qu'à un seul endroit. Les copies doivent être *produites automatiquement* à partir de l'original, jamais modifiées à la main.
- **Difficulté :** moyenne.

---

### Problème 3 — Le site public dépend de serveurs gratuits qui ne sont pas faits pour ça

- **Où :** [app/app.mjs:128-129](app/app.mjs#L128-L129).
- **Le problème :** le fond de carte vient directement des serveurs d'OpenStreetMap, et les polices des étiquettes viennent d'un serveur de **démonstration** de MapLibre. Ces deux services sont gratuits, mais leurs règles interdisent de s'en servir pour un site public qui reçoit du monde.
- **Pourquoi c'est important :** c'est comme brancher ta maison sur la prise électrique du voisin. Ça marche, jusqu'au jour où il la débranche.
- **Ce qui pourrait arriver :** si le site reçoit beaucoup de visites (par exemple le jour d'une soutenance), OpenStreetMap peut bloquer les demandes. Le fond de carte devient gris, et les chiffres sur les cercles disparaissent si le serveur de démonstration s'arrête.
- **La correction :** utiliser un fournisseur de fonds de carte prévu pour ça, avec une offre gratuite (par exemple MapTiler ou Stadia Maps), et placer les polices dans le projet.
  ```js
  // Avant
  glyphs:'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png']

  // Après (exemple)
  glyphs:'fonts/{fontstack}/{range}.pbf',          // copiées dans le projet
  tiles:['https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png']
  ```
- **Le concept à retenir :** **lis les conditions d'utilisation des services gratuits.** « Gratuit » ne veut pas dire « gratuit pour n'importe quel usage ». Ce qui suffit pour tester sur son ordinateur ne suffit pas toujours pour un site public.
- **Difficulté :** moyenne.

---

### Problème 4 — Des chiffres écrits en dur bloqueront la prochaine mise à jour

- **Où :** [scripts/prepare_licitor.py:68-69](scripts/prepare_licitor.py#L68-L69), [ligne 37](scripts/prepare_licitor.py#L37) et [ligne 64](scripts/prepare_licitor.py#L64). Le même problème se retrouve dans [app/app.mjs:270](app/app.mjs#L270) (« 167 juridictions »).
- **Le problème :** le script de préparation exige qu'il y ait **exactement** 87 811 biens et 85 232 biens localisés, sinon il s'arrête. L'année 2026 et la date de collecte sont aussi écrites à la main.
- **Pourquoi c'est important :** c'est comme une balance réglée pour n'accepter que 70 kg pile : le jour où tu pèses 71 kg, elle refuse de fonctionner.
- **Ce qui pourrait arriver :** tu refais une collecte en 2027 avec 90 000 biens. Le script plante avec un message obscur (`AssertionError`). Si tu contournes le problème, les biens de 2027 seront marqués « date atypique », et la méthodologie affichera toujours « collecté le 14 octobre 2026 ».
- **La correction :** garder des vérifications, mais sur ce qui doit **toujours** être vrai, et calculer le reste.
  ```python
  # Avant
  anomaly=year<1999 or year>2026
  assert len(records)==87811 and len({r['id'] for r in records})==len(records)
  assert precision['commune']==85232 and sum(cube.values())==len(records)
  'collected_at':'2026-10-14'

  # Après
  anomaly=year<1999 or year>datetime.date.today().year+1
  assert len({r['id'] for r in records})==len(records)    # pas de doublon
  assert sum(cube.values())==len(records)                 # totaux cohérents
  'collected_at':date de modification du fichier source
  ```
  Les chiffres exacts (87 811…) peuvent rester dans les **tests**, qui servent justement à vérifier une version précise des données.
- **Le concept à retenir :** **calcule au lieu d'écrire en dur.** Si une valeur peut changer un jour, elle doit être calculée ou réglable à un seul endroit.
- **Difficulté :** facile.

---

### Problème 5 — La légende et les couleurs de la carte sont définies à deux endroits

- **Où :** [app/app.mjs:216](app/app.mjs#L216) et [app/stats.mjs:36](app/stats.mjs#L36).
- **Le problème :** les seuils de couleur des départements (0, 1, 50, 150…) sont écrits une fois sous forme de nombres pour colorier la carte, et une deuxième fois sous forme de texte pour la légende (« 1–49 », « 50–149 »…).
- **Pourquoi c'est important :** c'est comme un plan de métro dont on change une ligne sans mettre à jour la légende. Les voyageurs se trompent sans le savoir.
- **Ce qui pourrait arriver :** quelqu'un change un seuil de 50 à 100 dans `stats.mjs`. La carte change de couleurs, mais la légende affiche toujours « 50–149 ». Ton analyse de mémoire s'appuie alors sur une légende fausse, et rien ne t'avertit.
- **La correction :** fabriquer le texte de la légende à partir des seuils eux-mêmes.
  ```js
  // Avant
  const labels=['0','1–49','50–149','150–299','300–599','600–1 199','≥ 1 200'];

  // Après
  const labels=CHORO.map((n,i)=>i===0?'0':i===CHORO.length-1?`≥ ${num(n)}`:`${num(n)}–${num(CHORO[i+1]-1)}`);
  ```
- **Le concept à retenir :** **ne te répète pas** (en anglais *DRY : Don't Repeat Yourself*). Si deux endroits disent la même chose, l'un des deux finira par mentir.
- **Difficulté :** facile.

---

### Problème 6 — Le même calcul est fait trois fois à chaque filtre

- **Où :** [app/app.mjs:190-192](app/app.mjs#L190-L192).
- **Le problème :** à chaque changement de filtre, le programme regroupe les ~85 000 biens par commune trois fois de suite, avec exactement les mêmes réglages, pour obtenir trois résultats identiques.
- **Pourquoi c'est important :** c'est comme photocopier le même document trois fois au lieu de le photocopier une fois et d'en distribuer trois exemplaires.
- **Ce qui pourrait arriver :** sur un ordinateur récent, ça ne se voit presque pas. Sur un vieux téléphone, chaque clic sur un filtre peut faire « ramer » la page.
- **La correction :**
  ```js
  // Avant
  map.getSource('heat').setData(groupedPoints(current,['commune']));
  map.getSource('points').setData(groupedPoints(current,['commune']));
  map.getSource('approx').setData(groupedPoints(current,['commune']));

  // Après
  const grouped=groupedPoints(current,['commune']);
  for(const id of ['heat','points','approx'])map.getSource(id).setData(grouped);
  ```
- **Le concept à retenir :** **calcule une fois, réutilise.** Quand un résultat sert plusieurs fois, range-le dans une variable.
- **Difficulté :** facile.

---

### Problème 7 — Le fichier de données est trois à quatre fois trop lourd

- **Où :** [scripts/prepare_licitor.py:47-53](scripts/prepare_licitor.py#L47-L53) et [ligne 67](scripts/prepare_licitor.py#L67).
- **Le problème :** chacun des 87 811 biens répète des informations identiques pour tous (par exemple `"origin":"commune_publiee_licitor"`, `"score":null`), et le fichier contient un grand tableau de 46 447 lignes (`aggregates`) que la page n'utilise jamais : seuls les tests s'en servent.
- **Pourquoi c'est important :** c'est comme imprimer « Fait à Paris » sur chacune des 87 811 fiches d'un classeur au lieu de l'écrire une seule fois sur la couverture.
- **Ce qui pourrait arriver :** 54 Mo à lire pour le navigateur. Sur un téléphone, la page peut mettre longtemps à s'ouvrir, ou même se fermer par manque de mémoire. C'est aussi pour ça que la version en ligne a dû être découpée en 5 morceaux.
- **La correction :** retirer les valeurs identiques partout, et écrire `aggregates` dans un fichier séparé réservé aux tests.
  ```python
  # Avant (dans chaque fiche)
  'score':None, 'origin':'commune_publiee_licitor', ...
  data={..., 'aggregates':[...]}

  # Après
  # (ces champs disparaissent des fiches ; une seule mention dans 'audit')
  data={...}                                          # sans aggregates
  dump(ROOT/'reports/aggregates.json', [...])         # pour les tests
  ```
- **Le concept à retenir :** **n'envoie que ce qui sert.** Tout ce qui est envoyé au navigateur coûte du temps et de la mémoire au visiteur.
- **Difficulté :** moyenne (il faudra aussi adapter l'export CSV et les tests).

---

### Problème 8 — Le code est très difficile à lire pour un humain

- **Où :** tout [app/app.mjs](app/app.mjs), par exemple [la ligne 306](app/app.mjs#L306) qui contient 13 instructions à la suite, et les noms `f`, `$`, `r`, `c`.
- **Le problème :** le code est tassé au maximum : plusieurs actions sur une même ligne, des noms d'une seule lettre, presque aucun commentaire.
- **Pourquoi c'est important :** c'est comme une recette écrite en abrégé sur un ticket de métro. Le chef qui l'a écrite s'en sort, mais personne d'autre.
- **Ce qui pourrait arriver :** quand tu demandes une modification à une IA, elle comprend moins bien ce que fait chaque partie. Le risque d'erreur augmente, et toi, tu ne peux pas vérifier ce qu'elle a changé.
- **La correction :**
  ```js
  // Avant
  $('reset').onclick=()=>{clearTimeout(queued);Object.assign(f,{from:data.audit.min_year,...});$('from').value=f.from;...};

  // Après
  // Bouton « Réinitialiser » : remet tous les filtres à zéro et recentre la carte.
  $('reset').onclick = () => {
    clearTimeout(queued);
    resetFilters();
    syncFilterInputs();
    update();
    recenterMap();
  };
  ```
  Et renommer `f` en `filters`.
- **Le concept à retenir :** **le code est lu bien plus souvent qu'il n'est écrit.** Des noms clairs et une action par ligne valent mieux qu'un code court.
- **Difficulté :** moyenne (beaucoup de lignes à reprendre, mais sans difficulté technique).

---

### Problème 9 — Le message d'erreur du site public donne une consigne absurde

- **Où :** [app/app.mjs:331](app/app.mjs#L331).
- **Le problème :** en cas de problème de chargement, la page affiche « Lancez python3 scripts/serve.py depuis le projet ». Sur le site public, le visiteur n'a ni Python ni le projet.
- **Pourquoi c'est important :** c'est comme un panneau « Appelez le gardien au poste 12 » dans un bâtiment où il n'y a ni gardien ni téléphone.
- **Ce qui pourrait arriver :** ton professeur ouvre le site sur un réseau lent, le chargement échoue, et il lit une consigne technique incompréhensible. Mauvaise impression, et aucune piste pour s'en sortir.
- **La correction :** adapter le message selon l'endroit où tourne la page.
  ```js
  // Avant
  `Chargement impossible : ${error.message}. Lancez python3 scripts/serve.py ...`

  // Après
  const local=location.hostname==='127.0.0.1'||location.hostname==='localhost';
  `Chargement impossible : ${error.message}. `+(local
    ?'Lancez python3 scripts/serve.py depuis le projet.'
    :'Vérifiez votre connexion puis rechargez la page.')
  ```
- **Le concept à retenir :** **écris les messages d'erreur pour la personne qui va les lire**, pas pour toi. Un bon message dit ce qui s'est passé et ce qu'on peut faire.
- **Difficulté :** facile.

---

### Problème 10 — La liste des outils à installer est fausse

- **Où :** [requirements.txt:1](requirements.txt#L1).
- **Le problème :** ce fichier demande d'installer `pandas`, alors que seul l'ancien script `scripts/prepare.py` s'en sert. Le README dit au contraire que rien n'est à installer.
- **Pourquoi c'est important :** c'est comme une liste de courses qui contient encore les ingrédients d'une recette que tu ne fais plus.
- **Ce qui pourrait arriver :** quelqu'un (ou une IA) installe pandas pour rien, ce qui prend plusieurs minutes. Ou bien il croit, à tort, que le projet en a besoin, et s'inquiète de ne pas réussir à l'installer.
- **La correction :**
  ```
  # Avant (requirements.txt)
  pandas>=2.2,<4

  # Après
  # Aucune dépendance pour ATLAS (bibliothèque standard Python).
  # pandas n'est utile que pour l'ancien script scripts/prepare.py.
  ```
- **Le concept à retenir :** **la documentation fait partie du code.** Quand le code change, les fichiers qui le décrivent doivent changer avec lui.
- **Difficulté :** facile.

---

## 4. Trois choses bien faites

### 1. Des tests qui vérifient les vraies données

[tests/test_data.py](tests/test_data.py) compare la carte au tableau Licitor d'origine : nombre de biens, dates, coordonnées, lots regroupés. [tests/stats.test.mjs](tests/stats.test.mjs) essaie 163 combinaisons de filtres.

**Pourquoi c'est bien :** pour un mémoire, la crédibilité des chiffres est essentielle. Ces tests prouvent que la carte ne « invente » rien. Ils donnent aussi un filet de sécurité : après une modification, on relance les tests et on sait tout de suite si quelque chose est cassé.

### 2. De bons réflexes de sécurité

- La fonction `esc` ([app/app.mjs:7](app/app.mjs#L7)) neutralise les caractères spéciaux avant d'afficher un texte venant des données. Une annonce piégée ne peut donc pas injecter de code dans la page.
- Le serveur local ([scripts/serve.py:14-15](scripts/serve.py#L14-L15)) refuse de donner un fichier situé hors du dossier `app/`, et n'accepte que les connexions venant de ton propre Mac ([ligne 40](scripts/serve.py#L40)).
- Les liens externes utilisent `rel="noopener"`, qui empêche le site ouvert dans un nouvel onglet d'agir sur ATLAS.

**Pourquoi c'est bien :** ce sont des protections qu'on oublie souvent, même dans des projets professionnels.

### 3. La séparation entre calculs et affichage, et l'honnêteté sur les données

Tous les calculs (filtrer, compter, classer) sont rangés dans [app/stats.mjs](app/stats.mjs), un petit fichier indépendant de la carte. C'est justement ce qui permet de le tester facilement. Par ailleurs, la méthodologie et les légendes précisent ce que les données *ne disent pas* : les points sont au centre de la commune, et une annonce ne prouve pas une vente.

**Pourquoi c'est bien :** séparer les calculs de l'affichage, c'est comme séparer la cuisine de la salle d'un restaurant. On peut changer la décoration sans toucher aux recettes. Et la transparence sur les limites des données, c'est exactement ce qu'attend un jury de mémoire.

---

## 5. Plan d'action

| Ordre | Action | Problème | Difficulté | Pourquoi maintenant |
|---|---|---|---|---|
| 1 | Créer une première sauvegarde Git | n°1 | Facile | Protège tout le reste. **À faire avant toute modification.** |
| 2 | Unifier les deux copies + script de publication | n°2 | Moyenne | Sinon, chaque correction est à faire deux fois. |
| 3 | Corrections rapides : message d'erreur, calcul fait 3 fois, légende, requirements.txt | n°9, 6, 5, 10 | Facile | Gros gain pour peu d'effort. On relance les tests après. |
| 4 | Remplacer les fonds de carte et les polices | n°3 | Moyenne | Avant de diffuser largement le lien (soutenance, partage). |
| 5 | Retirer les chiffres en dur du script de préparation | n°4 | Facile | Avant la prochaine collecte de données. |
| 6 | Alléger le fichier de données | n°7 | Moyenne | Améliore l'expérience sur téléphone. |
| 7 | Rendre le code plus lisible, petit à petit | n°8 | Moyenne | À faire progressivement, à chaque fois qu'on touche une partie du code. |

**Règle d'or pour chaque étape :** commit → modification → relancer les tests → vérifier la carte → commit.
