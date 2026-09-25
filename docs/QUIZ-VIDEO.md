# Quiz vidéo en une commande

```sh
node apps/cli/quiz-video.js spec.json --out out/ --theme qff --assets-dir . --jobs 4 --target instagram-reel
node apps/cli/quiz-video.js spec.json --theme light --check
node apps/cli/quiz-video.js spec.json --out out-audio/ --assets-dir . --audio mix.wav --sfx default --preview auto
```

Le compilateur accepte les modes `choices`, `list`, `cards`, `levels` et `stack`. Voir [QUIZ.md](QUIZ.md) pour la spec, les thèmes et les formats. `--theme` accepte un nom embarqué ou un fichier JSON. Les surcharges de thème de la spec restent prioritaires champ par champ. Les références `file:` sont résolues sous `--assets-dir` ; le logo QFF est résolu depuis le kit du dépôt indépendamment de ce dossier et du répertoire courant. Les autres logos `file:` sont relatifs au dossier du fichier thème, ou à `--assets-dir` pour un thème directement dans la spec. Le projet sauvegardé embarque ses images et fonctionne ensuite hors réseau ; les sons restent des ressources CLI externes.

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

## Extensions modulaires (23 septembre 2026)

Exemple exécutable : `examples/quiz-video-modular.spec.json` (lancer avec `--assets-dir .`). `node apps/cli/quiz-video.js --schema` imprime un contrat compact pour un agent. Les anciennes specs gardent leurs valeurs de rendu, hormis la correction des rectangles : `rx` et `ry` sont maintenant identiques et limités par la largeur et la hauteur. Les barres et libellés de progression sont partagés entre cartes de niveau et questions.

### Voix et export final

```sh
node apps/cli/quiz-video.js spec.json --assets-dir . --voice-clips clips/ --music musique.mp3 --sfx default --out sortie/
node apps/cli/quiz-video.js spec.json --assets-dir . --voice-clips clips/ --music default --loudness -16 --out sortie/
```

`--voice-clips` cherche les WAV nommés comme les IDs du `voice-script.json` (`intro.wav`, `level_1.wav`, `question_1.wav`, `question_1_answer.wav`, `outro.wav`, et ID d'une scène personnalisée). Les durées sont mesurées avec ffprobe ; aucun fichier de durées séparé n'est nécessaire. Il faut au moins un clip ; les clips absents et les chevauchements sont signalés. Ne pas combiner `--voice-clips` et `--voice-durations`, ni `--audio` avec `--voice-clips`/`--music`. `timing.read: "voice"` garde son rôle pour caler les questions. Avec `--voice-clips`, les autres créneaux (intro, niveau, réponse, outro, scène personnalisée) sont prolongés pour accueillir le clip, avec `voice.min` et `voice.pad` (0 et 0,3 s par défaut). Les limites `readMax` n'écourtent pas un clip mesuré, mais un dépassement est signalé. `voice.offsets` contient `intro` (0,3 s), `level` (0), `question` (0), `answer` (0,1 s), `outro` (0) ; ces valeurs sont ajoutées au début du créneau. Les anciens fichiers `--voice-durations` restent acceptés.

`--music fichier.mp3|wav` boucle le fichier et applique un fondu de sortie. `--music default` synthétise localement une boucle déterministe ; `music: {"bpm":108,"root":48,"progression":[0,5,9,7]}` règle tempo, note racine MIDI et décalages d'accords en demi-tons. La musique baisse sous la voix (sidechain), la voix est filtrée sous 80 Hz et compressée ; le mix utilise `loudnorm` (défaut -16 LUFS, true peak cible -1,5 dB). Le résultat mesure et rapporte la valeur réellement obtenue : une normalisation en un passage n'est pas une garantie de valeur exacte. Le JSON contient durée, codecs, cadence, fréquence/canaux audio, présence éventuelle d'`elst`, loudness mesurée, true peak et chevauchements. `--verbose` ajoute les instants détaillés. La progression CLI paraît tous les 10 %.

### Vérification rapide

```sh
node apps/cli/quiz-video.js spec.json --assets-dir . --check
node apps/cli/quiz-video.js spec.json --assets-dir . --out aperçu/ --preview-only --preview-scale 0.5 --frames 4.1,9.7 --crop 0,300,540,500
node apps/cli/quiz-video.js spec.json --assets-dir . --out brouillon/ --draft
```

`--check` ne crée aucun fichier ; il fournit les tailles finales de police, nombre de lignes, réduction, boîte de texte, empiètement de la zone réservée et intersections de boîtes dont les temps visibles se recoupent. Ces intersections sont des avertissements géométriques, pas un diagnostic visuel parfait. `--preview-only` écrit uniquement `project.json`, `preview.jpg` et les images `frame-XX.png` demandées, sans vidéo. `--preview-scale` règle la taille des vignettes de la planche (0,1–2). `--frames` accepte 1 à 24 instants ; `--crop` s'applique uniquement à ces PNG, en pixels du canevas source. `--draft` produit une vidéo à 15 images/s et à demi-dimensions ; les images sont encore rasterisées au format du projet avant réduction, donc le gain de temps dépend du projet. La sélection auto de la planche inclut les scènes personnalisées.

### Specs courtes et voix parlée

`"preset":"qff-reel"` remplit le thème, l'intro, l'outro et les noms ROOKIE/MASTER/GOAT sans répéter leur JSON. `--preset chemin.json` fusionne un fichier de valeurs par défaut avec la spec (celle-ci gagne ; `intro`, `outro`, `timing` et `defaults` fusionnent champ par champ). `defaults` à la racine puis par niveau fournit les champs communs aux questions ; chaque question gagne en dernier. `a` + `wrong:[...]` construit un QCM dont la position de la bonne réponse est déterminée par `voice.seed`. L'ancienne forme `choices`/`correctIndex` reste disponible.

`voice.answerTemplates` accepte plusieurs phrases avec `{a}` ; le choix tourne de façon déterministe avec `voice.seed`. `aSay` donne la forme parlée de la réponse. `voice.questionPrefixes` et `voice.pronounce` ajustent les autres textes lus. Quand un objet `voice` est fourni, la question parlée par défaut est le texte `q` ; sans cet objet, l'ancien script vocal garde son préfixe « Question N. ». `say` et `sayAnswer` restent prioritaires.

### Scènes, éléments et mise en page

`intro`, `levels[]`, `questions[]` et `outro` acceptent `elements:[...]` et `actors:[...]` du modèle v2. Les éléments demandent `id` et `type`, les autres champs ont les mêmes défauts et validations que le core. Les temps `start`/`end` et keyframes sont relatifs à la scène. `sequence:[{"after":"question_3","id":"interlude","duration":2,"elements":[...],"actors":[...],"say":"..."}]` insère des scènes après un ID généré (ou `after:"start"`). Les événements, créneaux vocaux et questions suivantes sont décalés. Il s'agit d'insertions, pas d'une permutation arbitraire des questions. Les éléments/acteurs sont validés et rendus par les schémas v2 ; aucun SVG/HTML libre ou URL externe n'est accepté.

`layout` au niveau spec, puis scène/question, cible les IDs des éléments générés (par exemple `question_panel`, `answer`, `progress_label_*`) : `visible`, `x`, `y`, `w`, `h`, `fontSize`, `radius`, `fill`, `color`, `align`, `opacity`. Le suffixe `*` cible un préfixe ; la règle la plus locale gagne. `x/w` sont des fractions de la largeur et `y/h` des fractions de la hauteur sûre. Un texte accepte `w` comme largeur maximale, mais pas `h` ; utiliser `fontSize` ou un élément texte personnalisé. Les surcharges incompatibles avec le type d'élément sont rejetées. `presenter` à la racine ou par question crée un véritable acteur v2 dans le Reel, avec `name`, `x/y` relatifs, couleurs, échelle, action et dialogue `question|answer|none` ; `presenter:null` le désactive localement.

### Questions et images

`type:"true-false"` convertit `a:"true"|"false"|"vrai"|"faux"` en deux choix localisés. `type:"odd-one-out"` garde les cartes QCM mais permet de marquer la sémantique ; `type:"estimate"` exige une réponse numérique et anime son compteur à la révélation. `choicesLayout:"grid"|"list"|"two"|"overlay"` change l'arrangement portrait ; `overlay` conserve l'image en grand derrière les choix. `hint`, `explanation`, `points`, ainsi que `labels:{level,question,of,answer}`, sont disponibles dans le mode niveaux. `countdownStyle:"ring"|"bar"|"digits"` et `countdownPosition:{x,y}` règlent le compte à rebours.

L'effet d'image accepte toujours la chaîne existante. Sa forme objet `{ "type":"blur"|"pixelate"|"zoom", "from":18, "to":0, "ease":"easeOut" }` anime progressivement le dévoilement pendant le compte à rebours. `answerImage` affiche une autre image à la révélation. `crop:{x,y,w,h}` recadre par fractions de l'image source, combinable avec `focusX/focusY` et l'effet. Le même rendu SVG déterministe sert à l'éditeur et à l'export.

Limites actuelles : pas encore de grille de choix entièrement illustrés, de fondu/glissé entre scènes, de bruitages provenant d'un fichier dans `--sfx`, de polices TTF personnalisées, ni de cache de calques statiques. Les scènes/éléments/acteurs v2 et `layout` couvrent une grande partie des variantes visuelles sans multiplier des options spécialisées ; une transition temporelle ou une police arbitraire demande un contrat de rendu et de sécurité commun navigateur/headless.

## Questions sonores et liste verticale (25 septembre 2026)

Le mode `levels` accepte `audio:"file:sons/lion.ogg"` par question. Formats lus par FFmpeg : MP3, Ogg, Opus, WAV, FLAC ; chaque fichier est limité à 30 Mo et 120 s. `--assets-dir` est obligatoire pour un son `file:` ; traversées de dossier, liens symboliques sortants, vidéo déguisée et absence de flux audio sont refusés. `audio:"asset:lion"` est un alias local défini par `audioAssets:{"lion":"file:sons/lion.ogg"}` dans la spec, pas un média intégré au projet v2. Les sons ne sont pas embarqués dans `project.json` : conserver les fichiers sources pour régénérer la vidéo. `fetch-assets.js` ne télécharge toujours que des images.

Champs optionnels de question : `audioStart` en secondes (défaut 0), `listen` (défaut `timing.listen`, 4 s), `audioGain` en dB (-24 à +24), `revealImage` (visible à la réponse), `replayOnReveal` et `audioDuringCountdown:"stop"|"continue"|"loop"`. Le son peut être défini dans `defaults` puis surchargé par niveau/question. Le calendrier exporte `listenStart`, `listenEnd`, la source et le départ dans la source ; l'ordre est lecture → écoute → compte à rebours → réponse. La question reste nette pendant l'écoute. `listenVisual:"bars"|"wave"|"pulse"` anime les éléments `listen_icon`, `listen_label` et `listen_viz_*` d'après des amplitudes réellement décodées ; sans analyse audio côté navigateur, le compilateur utilise un motif de repli. Les voix de question s'arrêtent avant l'écoute ; le stem sonore ne contient ni voix ni effets.

```sh
node apps/cli/quiz-video.js examples/quiz-sons-15.spec.json --assets-dir mes-assets --check
node apps/cli/quiz-video.js examples/quiz-sons-15.spec.json --assets-dir mes-assets --out sortie/ --sounds-out sortie/sounds.wav --music default --safe-zones
node apps/cli/quiz-video.js examples/quiz-sons-15.spec.json --assets-dir mes-assets --out écoute/ --audio-preview
```

L'exemple à 15 sons est un gabarit : placer soi-même des fichiers licites dans `mes-assets/sons/01.ogg` à `15.ogg`. `--sounds-out` ajoute un WAV 48 kHz stéréo calé à zéro, avec silences, fondus courts et normalisation de chaque extrait vers -18 LUFS avant `audioGain`; la mesure réelle dépend du contenu, de la durée et du limiteur. Le son est également inclus dans `video.mp4` et la musique est abaissée sous le son et la voix. `--check` mesure durée, loudness et crête des fichiers, sans sortie. `--safe-zones` dessine en rouge transparent les zones haute/basse réservées dans `preview.jpg` uniquement, jamais dans la vidéo finale. `--preview auto` couvre aussi écoute, révélation, récapitulatif et fin.

`--audio-preview` produit rapidement `audio-preview.mp3`, `timeline.json` et `voice-script.json`, sans calculer d'images ; il requiert au moins une source sonore (question, voix, musique ou SFX) et ne se combine pas avec `--preview-only`. Cet aperçu mélange les pistes mais n'applique pas le ducking sidechain du MP4 final : écouter le MP4 avant publication pour juger l'équilibre exact.

`revealMode:"end"` supprime les réponses intermédiaires et crée des scènes `recap_N` avant l'outro, de `recapSeconds` secondes (défaut 1,6) chacune ; les voix de réponse sont déplacées dans ces scènes. `intro.logoSeconds:0` supprime la carte logo séparée tout en laissant le logo du thème dans les scènes qui le demandent.

Le nouveau mode `stack` produit un projet v2 portrait 1080 × 1920, 5 à 15 entrées : bandeau rouge, image ou repère visuel, lignes cumulatives, arrivée animée de la réponse, progression et carte finale courte. Exemple exécutable sans ressources externes : `examples/quiz-stack.spec.json`. La spec accepte `mode:"stack"`, `preset:"qff-stack"`, `title`, `theme`, `bannerColor`, `items:[{a,q?,image?,revealImage?,backgroundImage?,audio?,...}]`, `timing:{show,listen,countdown,reveal,endHold}`, `end:{text,say}`, `layout` par ID et `elements` v2 par item. La voix de réponse est prévue par défaut dans `voice-script.json`, avec `sayAnswer` par item ; fournir les WAV correspondants avec `--voice-clips` pour l'entendre. Les images et le fond peuvent changer à chaque item. `loopFade:true` (défaut) fait passer la première et la dernière image par le même fond uni ; le désactiver pour un montage à coupe franche. Les zones sûres laissent 220 px en bas en portrait.

Non livré dans ce lot : décodage d'un fichier vidéo comme arrière-plan animé, raccord de mouvement véritablement seamless (le fondu ne l'est pas), téléchargement d'audio/vidéo par `fetch-assets.js`, et contrôle de normalisation à ±1 LU sur des extraits silencieux ou très courts. Ces points demandent un contrat média qui reste cohérent entre projet v2 éditable, navigateur et rendu headless ; les annoncer comme limites, pas comme options existantes.
