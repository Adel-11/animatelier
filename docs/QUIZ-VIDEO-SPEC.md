# Vidéos quiz en une commande : images, thèmes, logo, gabarit « niveaux »

Spécification pour l'agent qui développe Animatelier. Rédigée par l'agent qui produit les vidéos QFF
(Quiz Factory Forever) depuis un conteneur Linux sans écran, avec le CLI headless livré le 20 sept. 2026.

## Pourquoi

Aujourd'hui, pour une vidéo comme `qff-levels-1` (15 questions, 3 niveaux, 1080x1920, 2 min 58), je dois :

1. écrire un générateur de 200 lignes hors du dépôt, qui fabrique les rectangles, textes, flous et compte à rebours à la main ;
2. rendre avec `apps/cli/render.js` (environ 9 min avec `--jobs 4`) ;
3. incruster le logo QFF avec ffmpeg, car le format ne gère pas les images ;
4. recalculer moi-même le minutage de chaque événement pour caler voix, tics et musique ;
5. réencoder pour Instagram (sa plateforme refuse les MP4 avec liste d'édition) ;
6. extraire des images fixes et les assembler pour vérifier la mise en page.

Objectif : une seule commande produit la vidéo muette, finie, avec le logo, plus un fichier de minutage
et un script de voix off. Je n'ai plus qu'à générer la voix, la musique, et à les mixer (idéalement via
une option de la même commande).

Règle du propriétaire à respecter : l'outil reste générique, fait de briques combinables. Le gabarit
« quiz à niveaux » décrit plus bas doit être construit sur des briques génériques (élément image, thèmes,
minutage), comme `compileQuiz` l'est déjà.

## Lot 1 : élément `image` générique (débloque le logo et les quiz d'images)

- Nouveau type d'élément `image` : `src`, `x`, `y`, `w`, `h`, `fit` (`contain` ou `cover`), `radius`,
  plus les propriétés communes (opacity, scale, rotation, anchor, z, start/end, keyframes).
- Animables : x, y, w, h, scale, opacity, rotation, **blur** (déjà existant), et si possible `pixelate`
  (taille de bloc, pour l'effet « devine le logo »).
- `src` ne contient jamais d'URL externe. Deux formes :
  - `asset:<id>` qui pointe vers `project.assets[<id>]` (`{ mime, sha256, data }` en base64), pour un projet autonome ;
  - `file:<chemin relatif>` résolu par le CLI dans un dossier passé avec `--assets-dir`, sans `..` ni chemin absolu.
    C'est la forme que j'utiliserai : le JSON reste léger.
- Formats acceptés : PNG, JPEG, WebP. Validation par décodage réel, plafonds (par exemple 5 Mo par image,
  30 Mo par projet), dimensions max 4096.
- Rendu : `<image href="data:...">` dans le SVG, identique pour resvg, le navigateur et `render_frame`.
- Éditeur : bouton « Importer une image » (stockage IndexedDB, pas localStorage, à cause de la taille).

## Lot 2 : images disponibles dans le cloud, sans l'ordinateur du propriétaire

Je travaille dans un conteneur qui clone le dépôt GitHub. Il me faut deux choses :

- **Kits de marque versionnés dans le dépôt** : `brands/<nom>/` avec `logo.png` et `brand.json`
  (couleurs, placement du logo, voir lot 3). Créer `brands/qff/` avec le logo QFF fourni
  (fichier `qff_logo.png` déposé par le propriétaire dans `projets-videos/qff-brand/`, 1254x1254, fond #07275F).
  Documenter la provenance dans `docs/ASSETS.md`.
- **Récupération d'images pour un quiz** : `node apps/cli/fetch-assets.js manifest.json --out assets/`
  - manifeste : `[{ "id": "q3", "url": "https://..." }]` ;
  - accepte les liens de partage Google Drive (conversion en lien de téléchargement direct) et les URL https simples ;
  - vérifie le type réel, la taille, calcule le sha256, met en cache, n'écrase rien ;
  - produit `assets/manifest.lock.json` (id, fichier, sha256, dimensions) réutilisable par `--assets-dir`.
- Note pour le propriétaire (pas pour l'agent) : mon réseau n'accède qu'aux domaines autorisés. Pour tirer les
  images depuis Google Drive, il faudra autoriser `drive.google.com` et `drive.usercontent.google.com`,
  comme on l'a fait pour `n8n.letter-bird.com`.

## Lot 3 : thèmes

- Fichier de thème JSON (`themes/<nom>.json`, et `brands/<nom>/brand.json` qui peut en étendre un) :
  - couleurs : `background`, `panel`, `track`, `text`, `muted`, `accent`, `answer`, et une liste `levels`
    (couleur par niveau) ;
  - fond : uni, dégradé linéaire, ou motif simple ;
  - logo : `src`, placement (`top-left`, `top-right`...), taille, marges, présent sur quelles scènes ;
    logo d'intro : taille, durée, fondu ;
  - typographie : famille (parmi les polices embarquées), échelle de tailles, graisse ;
  - formes : rayons des panneaux, épaisseur de l'anneau du compte à rebours.
- CLI : `--theme qff` (ou chemin), surchargeable champ par champ dans la spec du quiz.
- Tous les gabarits de quiz lisent le thème, aucune couleur codée en dur.
- Fournir au moins `qff` (fond #07275F, panneaux #0F3678, piste #1B478F, texte #FDF8E3, atténué #B7C3E6,
  accent #FECD1B, niveaux #3DDC97, #FF8A3D, #FF4D6D) et un thème clair de démonstration.

## Lot 4 : gabarit « quiz à niveaux » dans le compilateur de quiz

Étendre `compileQuiz` (ou ajouter un mode) pour produire exactement ce que fait mon générateur actuel.
Le fichier `gen_lv.js` joint dans le projet claude.ai « animatelier » sert de référence (mise en page et minutage).

Spec d'entrée proposée :

```json
{
  "mode": "levels",
  "format": "reel-9x16",
  "theme": "qff",
  "language": "en",
  "intro": { "logoSeconds": 3, "title": "15 QUESTIONS", "subtitle": "3 LEVELS", "tagline": "How far can you go?" },
  "levels": [
    { "name": "ROOKIE", "subtitle": "Warm-up time",
      "questions": [ { "q": "How many days are there in a leap year?", "a": "366" } ] }
  ],
  "questionEffect": "blur",
  "timing": { "read": "auto", "readMin": 3.5, "readMax": 4.5, "countdown": 4, "answer": 2.4,
              "levelCard": 2.2, "outro": 7, "maxDuration": 180 },
  "outro": { "title": "What's your score?",
             "tiers": ["0-5 · ROOKIE", "6-10 · MASTER", "11-15 · GOAT"],
             "cta": ["Drop it in the comments!", "Follow Quiz Factory Forever"] }
}
```

Contenu généré (tout piloté par le thème) :

- intro : logo plein écran pendant `logoSeconds` (c'est aussi l'image de couverture), puis titres et pastilles de niveaux ;
- carte de transition par niveau (nom en grand, sous-titre) ;
- par question : pastille « LEVEL n · NOM » à la couleur du niveau, « QUESTION n OF N », trois barres de progression
  (une par niveau, une case par question, la case courante se remplit à la révélation), panneau de question,
  anneau et chiffres du compte à rebours, panneau de réponse à la couleur du niveau ;
- question en `blur` pendant le compte à rebours (ou `hide`, ou `none`) ;
- **questions image** : champ optionnel `image` (`file:` ou `asset:`) affiché dans le panneau, avec
  `imageEffect` pendant le compte à rebours (`blur`, `pixelate`, `zoom` sur une zone, `none`), puis révélé net ;
- QCM optionnel (`choices` + `correctIndex`) dans ce même mode ;
- retour à la ligne et **taille de police ajustée automatiquement** pour tenir dans le panneau ;
- `format` : `reel-9x16` (1080x1920), `post-4x5` (1080x1350), `landscape` (1920x1080), avec mise en page adaptée
  et zone basse laissée libre en 9:16 (légendes et boutons Instagram) ;
- minutage automatique : si la durée dépasse `maxDuration`, réduire d'abord `answer` puis `read` jusqu'aux minimums,
  sinon avertissement explicite.

Sorties du compilateur, en plus du projet :

- `timeline.json` enrichi : pour chaque question, instants de début, fin de lecture, 4 tics du compte à rebours,
  révélation, fin ; cartes de niveau ; intro ; outro ;
- `voice-script.json` : créneaux `{ id, start, maxDuration, text }` (intro, annonces de niveau, « Question one... »,
  réponses, outro). Les nombres écrits en toutes lettres dans le texte à lire (« 1440 » devient
  « one thousand four hundred and forty »), selon la langue.

## Lot 5 : une seule commande, du JSON à la vidéo prête à publier

```sh
node apps/cli/quiz-video.js spec.json --out out/ --theme qff --jobs 4 --target instagram-reel
```

Produit dans `out/` : `video.mp4` (muet), `project.json`, `timeline.json`, `voice-script.json`, `cover.jpg`,
`preview.jpg` (planche contact).

- `--target instagram-reel` : H.264 high, yuv420p, 30 i/s constants, GOP fermé (`-g 60 -flags +cgop`),
  **pas de liste d'édition** (`-use_editlist 0`), `+faststart`, débit vidéo raisonnable (CRF 26-28 suffit sur ces
  aplats, `-tune animation`). Leçon apprise : Instagram rejette nos MP4 avec liste d'édition.
- `--audio mix.wav` : muxe une piste audio fournie en AAC 128 kb/s, 48 kHz, stéréo (spécification Instagram),
  sans réencoder la vidéo.
- `--sfx default` (optionnel mais très utile) : génère des bruitages synthétiques à partir de la timeline
  (tic à chaque seconde du compte à rebours, son à la révélation, montée à chaque carte de niveau, souffle entre
  les questions), sans fichier externe. Mapping générique « type d'événement vers son », surchargeable.
- `--cover cover.jpg --cover-at 1` : image de couverture JPEG 9:16.
- `--preview t1,t2,...` ou `--preview auto` : planche contact JPEG des instants clés, pour que je vérifie la mise
  en page sans extraire les images moi-même.
- `--check` : valide la spec, calcule la durée, signale les textes qui débordent, sans rendre.

## Lot 6 : performance du rendu

Mesuré : 5344 images en 1080x1920 avec flou, environ 9 minutes avec `--jobs 4`. Pistes :

- **dédoublonnage d'images** : pendant la lecture d'une question, beaucoup d'images consécutives donnent
  exactement le même SVG. Hacher le SVG et réutiliser le raster précédent quand il est identique ;
- rendre une fois les éléments statiques d'une scène et composer par-dessus (si resvg le permet proprement) ;
- `--jobs` par défaut au nombre de coeurs disponibles.

## Critères d'acceptation

1. Avec la spec d'exemple (`qff-pipeline/spec-exemple.json` dans le projet claude.ai), une commande produit une
   vidéo visuellement équivalente à `qff-levels-1.mp4` (déposée dans `projets-videos/qff-levels-1/`), logo compris,
   sans ffmpeg externe ni script hors dépôt.
2. `ffprobe` : 30 i/s constants, durée à une image près ; aucune boîte `elst` dans le MP4 ; audio AAC 128k 48 kHz
   quand `--audio` est fourni.
3. Changer `--theme` change toutes les couleurs et le logo, sans toucher à la spec.
4. Une question avec `image` et `imageEffect: "pixelate"` affiche l'image pixelisée pendant le compte à rebours
   puis nette à la révélation, dans l'aperçu navigateur comme dans le CLI.
5. `fetch-assets.js` télécharge une image depuis un lien de partage Google Drive public, refuse un fichier non image,
   et le rendu fonctionne ensuite hors réseau.
6. Déterminisme : hash des pixels identique sur deux rendus successifs.
7. `npm test` et `npm run build` passent ; README, `docs/HEADLESS.md` et un nouveau `docs/QUIZ-VIDEO.md`
   documentent les commandes, et REPRISE.md est à jour.

## Ordre conseillé

Lot 1 (image), puis lot 3 (thèmes), puis lot 4 (gabarit niveaux), puis lot 5 (commande unique), puis lot 2
(récupération d'images), puis lot 6 (performance).
