# Quiz vidéo en une commande

```sh
node apps/cli/quiz-video.js spec.json --out out/ --theme qff --assets-dir . --jobs 4 --target instagram-reel
node apps/cli/quiz-video.js spec.json --theme light --check
node apps/cli/quiz-video.js spec.json --out out-audio/ --assets-dir . --audio mix.wav --sfx default --preview auto
```

Le compilateur accepte les modes `choices`, `list`, `cards` et `levels`. Voir [QUIZ.md](QUIZ.md) pour la spec, les thèmes et les formats. `--theme` accepte un nom embarqué ou un fichier JSON. Les surcharges de thème de la spec restent prioritaires champ par champ. Les références `file:` sont résolues sous `--assets-dir` ; le logo QFF est résolu depuis le kit du dépôt indépendamment de ce dossier et du répertoire courant. Les autres logos `file:` sont relatifs au dossier du fichier thème, ou à `--assets-dir` pour un thème directement dans la spec. Le projet sauvegardé embarque ses images et fonctionne ensuite hors réseau.

La commande publie six fichiers : `video.mp4`, `project.json`, `timeline.json`, `voice-script.json`, `cover.jpg` et `preview.jpg`. Les fichiers sont préparés dans un dossier temporaire et publiés seulement après réussite. Toute sortie existante provoque un refus ; choisir un autre dossier pour une nouvelle version. Il n’existe pas d’écrasement implicite. `--check` valide, résout les images et retourne durée, nombre d’images et avertissements de mise en page, sans rendu ni écriture.

Le profil par défaut, `instagram-reel`, encode H.264 High, yuv420p, 30 images/s constantes, CRF 27, tune animation, GOP fermé de 60 images, faststart et aucune liste d’édition MP4 (`elst`). Le canevas vient du format du quiz : sélectionner `reel-9x16` pour 1080 × 1920. Le profil ne recadre pas silencieusement les autres formats. `--audio mix.wav` ajoute AAC 128 kbit/s, 48 kHz stéréo avec copie du flux vidéo ; les pistes courtes sont complétées de silence, les longues tronquées à la durée vidéo. AAC peut ajouter un léger délai d’encodage et du padding en l’absence de liste d’édition.

`--sfx default` synthétise des tics, révélations, montées de niveau et transitions à partir des événements du minutage. Avec `--audio`, les deux pistes sont mélangées. Pour personnaliser, passer `--sfx sons.json` : un objet indexé par type d’événement, chaque valeur contenant `frequency` (40–12000 Hz), `duration` (0.01–3 s), `gain` (0–0.8, défaut 0.15) et `sweep` (variation totale en Hz, défaut zéro). `null` désactive un son. Types par défaut : `tick`, `reveal`, `level`, `question`. Synthèse déterministe, aucun fichier sonore téléchargé ; maximum 3600 secondes.

`--cover-at 1` choisit l’instant de couverture (défaut : 1 s, ou milieu pour les vidéos plus courtes). `--cover chemin.jpg` change son emplacement. La couverture conserve le format du projet. `--preview auto` sélectionne au plus 24 instants clés ; `--preview 0,3,8.5` choisit explicitement les instants. La planche garde l’ordre demandé, avec quatre colonnes maximum. Tous les instants doivent précéder la fin de la vidéo.

Le nombre de workers par défaut suit les cœurs disponibles, plafonné à 16 et réduit selon la mémoire libre et la taille du canevas. `--jobs 1` à `--jobs 16` le fixe explicitement. Chaque worker conserve seulement son dernier SVG haché et son raster ; un SVG identique réutilise les pixels. Le cache ne change ni le minutage ni le résultat et sa mémoire reste bornée. Le cache de calques partiels n’est pas implémenté : resvg rasterise la scène entière dès que son SVG change.

La commande valide un profil de fichier ; elle ne publie rien sur Instagram et ne garantit pas l’acceptation par la plateforme. Les vidéos et scripts de référence absents du dépôt doivent être fournis pour une comparaison visuelle exacte.

## Spec niveaux et images

Exemple complet versionné : `examples/quiz-levels.spec.json` (15 questions, 178,1 s). Le format compact historique `{id,name,levels:[{questions:[{q,a}]}]}` est accepté et reprend les valeurs QFF par défaut. La forme explicite utilise `mode:"levels"`, `format:"reel-9x16"|"post-4x5"|"landscape"`, `theme:"qff"|"light"` ou un objet de surcharges, `language:"en"|"fr"`, `intro`, `levels`, `questionEffect`, `timing`, `outro`. Les questions acceptent `q`, `a` ou `choices`/`correctIndex`, et éventuellement `image:"file:photo.png"`, `imageEffect:"blur"|"pixelate"|"zoom"|"none"`, `focusX`/`focusY` (0–1). `questionEffect` vaut blur, hide ou none. La zone basse du format portrait est réservée.

`timing` : read auto ou secondes, readMin/readMax (3.5/4.5), countdown entier (4), answer (2.4), answerMin (1), levelCard (2.2), outro (7), maxDuration (180). Dépassement : réduction answer puis read jusqu’aux minimums, avertissement si le budget reste impossible. Les textes sont ajustés aux panneaux et les débordements sont signalés. Les créneaux vocaux ont id/start/maxDuration/text ; nombres entiers convertis en toutes lettres EN/FR et alerte de débit estimé, sans synthèse vocale. Les effets de compte à rebours restent actifs jusqu’à la révélation.

Les JSON `themes/` et `brands/qff/brand.json` décrivent couleurs, niveaux, backdrop (solid/linear/pattern), logo, typographie et formes. Un fichier peut employer `extends` pour un thème embarqué. Logo : src, placement, size, margin ou marginX/marginY, scènes, introSize/introSeconds/fade. QFF reprend le logo fourni (860 px intro, 190 px x50/y165 ensuite). Changer le thème CLI remplace le thème nommé de la spec ; un objet de surcharges dans la spec reste prioritaire.

## Ressources et téléchargement

```sh
node apps/cli/fetch-assets.js manifest.json --out assets/
node apps/cli/quiz-video.js spec.json --out out/ --assets-dir assets/ --theme qff
```

Manifeste : `[{"id":"q3","url":"https://..."}]`. Les liens publics Drive `/file/d/ID/view` et ceux avec paramètre id sont convertis vers drive.usercontent.google.com. Les URL doivent être HTTPS publiques, sans identifiants ni port personnalisé. Chaque redirection est contrôlée ; adresses privées/locales refusées et DNS vérifié fixé pour la requête. Limite 5 Mo, décodage réel PNG/JPEG/WebP, dimensions ≤4096, SHA-256 calculé. Les fichiers restent nommés id.png/jpg/webp ; `manifest.lock.json` conserve source, empreinte et dimensions. Un cache identique est vérifié puis utilisé hors réseau, sans écriture. Aucun fichier existant n’est écrasé ; changer de dossier si le manifeste change. Un échec partiel peut laisser des fichiers : utiliser un nouveau dossier. HTML de connexion ou de confirmation Drive rejeté comme non-image. L’environnement d’exécution doit autoriser drive.google.com et drive.usercontent.google.com ; l’outil ne modifie pas la politique réseau.

## Contrat image v2 et navigateur

Élément générique `image` : src (`asset:id` ou `file:relatif`), w/h, fit contain/cover, radius et transformations habituelles ; blur, pixelate (0–100), zoom (1–10), focusX/focusY animables. project.assets associe un ID à `{mime,sha256,data}` base64. Le résolveur enrichit largeur/hauteur et un échantillon RGBA ≤64×64 utilisé pour les mosaïques SVG déterministes. La pixellisation a cette résolution maximale de détail ; pixelate=0 affiche l’image originale. Les images animées sont refusées. Limites : 100 assets, 30 Mo binaires par projet et 45 Mo pour le JSON importé. Aucun HTML/SVG importé, URL distante ou chemin absolu/traversant n’entre dans le rendu. Les symlinks sortant d’assets-dir sont rejetés.

« Importer une image » dans l’éditeur décode puis stocke la ressource dans IndexedDB ; localStorage ne conserve que les références SHA-256. Les JSON exportés restent autonomes. API : `await window.animatelier.loadWithAssets(project)` pour un projet avec images ; load reste synchrone pour les projets sans nouvelles ressources. Les projets avec file: doivent être résolus côté CLI avant import. Supprimer les données du navigateur supprime aussi IndexedDB : exporter le JSON pour sauvegarder.

Vérifications : tests locaux de décodage, traversée/symlink, cache, conversion Drive, pixellisation, MP4 sans elst, audio, déterminisme et vrais appels MCP. Le téléchargement d’un lien Drive public réel reste à vérifier avec une image publique fournie ; la conversion et le refus des réponses non-image sont couverts automatiquement.

## Mise en page des images, voix et audio (21 septembre 2026, suite)

### Images : `imageLayout` et `imageCard`

- `imageLayout: "compact"` (défaut) garde le comportement précédent : image d'environ 310 px de haut dans le panneau.
- `imageLayout: "hero"` : la question passe sur une ligne en haut du panneau (taille réduite automatiquement si elle est longue), l'image occupe presque toute la largeur et le panneau descend jusqu'au bloc compte à rebours/réponse, placé en bas de la zone utile. En 9:16 une image carrée fait 734 px (carte comprise : 782 px). Le compte à rebours est plus petit dans ce mode, la réponse s'affiche au même endroit.
- `imageCard: { "color": "#FFFFFF", "radius": 28, "padding": 24, "shape": "square" }` au niveau de la spec, surchargeable par question (`imageCard: null` la retire pour une question). `shape: "square"` (défaut) centre une carte carrée derrière l'image ; `"box"` remplit toute la zone (images larges). La carte n'est pas floutée, seul l'image subit `imageEffect`.

### Temps de lecture

- `read` par question (0,5 à 30 s) remplace la valeur globale pour cette question.
- `timing.read: "voice"` avec `--voice-durations voice-durations.json` (`{ "question_3": 1.14, ... }`) : `read = durée + readPad` (défaut 0,3 s), arrondi à l'image supérieure pour que le compte à rebours ne démarre jamais avant la fin de la voix. Bornes `readMin`/`readMax` : 1 s et 15 s par défaut dans ce mode (3,5 et 4,5 s en mode auto). Un bornage produit un avertissement. Une question absente du fichier repasse en lecture auto, avec avertissement.
- Les lectures fixées (par question ou par la voix) ne sont jamais raccourcies par `maxDuration` ; seules les lectures auto le sont.
- `timeline.json` (readEnd, tics, révélation) et `voice-script.json` (maxDuration du créneau) suivent ces valeurs.

### Textes de voix off

`say` et `sayAnswer` par question, `intro.say`, `levels[].say`, `outro.say` remplacent le texte généré dans `voice-script.json`, copiés tels quels (pas de conversion des nombres, pas de « Question N. »). `q` et `a` restent ceux affichés à l'écran.

### Libellés français

Avec `language: "fr"` : « NIVEAU n · NOM », « QUESTION n SUR N », « RÉPONSE ». La pastille de niveau est centrée sur son fond.

### QCM

En 9:16 et 4:5, les propositions sont des cartes sur deux colonnes (texte jusqu'à 56 px, ajusté), la bonne proposition prend la couleur du niveau à la révélation. Le paysage garde la liste à droite.

### Compte à rebours

Chaque chiffre, l'anneau et l'arc disparaissent une demi-image avant l'élément suivant : jamais deux chiffres sur la même image.

### Ajouter l'audio sans re-rendre

```sh
node apps/cli/mux-audio.js out/video.mp4 --audio mix.wav --out final.mp4
node apps/cli/mux-audio.js out/video.mp4 --audio voix-musique.wav --out final.mp4 --keep-sfx
```

Le flux vidéo est copié (paquets identiques, vérifié par framemd5), l'audio encodé en AAC 128 kbit/s, 48 kHz stéréo, sans `elst`, faststart. `--keep-sfx` mélange la piste audio déjà présente dans la vidéo (bruitages d'un rendu `--sfx`) ; si la vidéo est muette, les bruitages sont resynthétisés depuis `timeline.json` situé à côté de la vidéo (ou `--timeline`), avec `--sfx sons.json` en option. La sortie ne doit pas exister.

### Couverture

`--cover-image brands/qff/logo.png` : l'image (PNG/JPEG/WebP, mêmes contrôles que les autres images) est ajustée sans déformation sur une toile aux dimensions du projet, fond de la couleur `background` du thème, puis encodée en JPEG. `--cover-at` est alors ignoré.

### fetch-assets derrière un proxy

`HTTPS_PROXY`/`https_proxy` est honoré (tunnel CONNECT, authentification Basic si l'URL du proxy en contient), sauf si `NO_PROXY` correspond à l'hôte. Les contrôles restent : HTTPS port 443 uniquement, pas d'identifiants dans l'URL, noms locaux refusés (`localhost`, `.local`, `.internal`, noms sans point...), IP littérales privées refusées, chaque redirection revérifiée, TLS vérifié sur le nom d'hôte cible. Limite : derrière un proxy, si le DNS local ne répond pas, la résolution finale est faite par le proxy (les adresses privées sont refusées quand le DNS local répond). User-Agent par défaut `Animatelier/0.2 (+https://animatelier.netlify.app)`, modifiable avec `--user-agent` ou `ANIMATELIER_USER_AGENT`. Wikimedia refuse les vignettes à largeur non standard (HTTP 400) : utiliser l'original ou une largeur proposée par Commons.
