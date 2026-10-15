# Rendu vidéo sans navigateur (headless)

Spécification pour l'agent qui développe Animatelier. Objectif : qu'un agent distant
(conteneur Linux, sans écran, sans navigateur, sans l'ordinateur du propriétaire allumé)
puisse produire un fichier vidéo à partir d'un projet v2, en ligne de commande.

Aujourd'hui l'export passe par `MediaRecorder` dans un onglet visible, en temps réel :
il faut que la page reste au premier plan, la cadence n'est pas garantie et l'image réelle
arrive décalée d'environ 0,45 s par rapport au minutage du projet (mesuré sur un export de
135 s). Tout ça disparaît avec un rendu image par image hors navigateur.

## Lot 1 — Rendu image par image en CLI (le coeur)

Nouveau point d'entrée, par exemple `apps/cli` :

```sh
node apps/cli/render.js projet.json --out sortie.mp4 \
  --fps 30 --format mp4 --jobs 4 [--crop 352,0,576,720] [--scale 1080x1350]
```

Pipeline attendu, sans DOM :

1. Charger et valider le JSON avec `packages/core` (mêmes schémas qu'aujourd'hui).
2. Pour chaque image `f` : `t = f / fps`, puis `renderSvg(t)` de `packages/renderer`,
   qui est déjà déterministe et indépendant du DOM.
3. Rasteriser le SVG avec **`@resvg/resvg-js`** (binding Rust, pas de Chromium, pas de GPU).
   `sharp` (librsvg) est une solution de repli, mais son rendu du texte et des filtres est
   moins fidèle.
4. Encoder avec ffmpeg en cadence constante : flux `rawvideo` sur stdin, ou séquence PNG.
   H.264 `yuv420p` pour le MP4, VP9 pour le WebM.

Contraintes :

- Node 22, CPU uniquement, aucune dépendance au navigateur, à `localStorage` ni à Netlify.
- Déterminisme : le même JSON doit donner exactement les mêmes images. À vérifier en CI
  avec le hash de trois images de référence.
- ffmpeg : soit présent sur la machine, soit installé via `ffmpeg-static` (npm).

### Polices

C'est le piège principal. Le SVG demande `Arial, sans-serif`, qui n'existe pas sur un
conteneur Linux : le rendu tombe sur une police de repli et la mise en page change.

- Embarquer une police dans le dépôt (Liberation Sans a les mêmes métriques qu'Arial,
  DejaVu Sans est déjà présente sur la plupart des images Linux) et la charger
  explicitement : `loadSystemFonts: false` plus `fontFiles: [...]`.
- Rendre la famille configurable au niveau du projet (`fontFamily`), et l'écrire dans le SVG.
- Documenter la licence de la police dans `docs/ASSETS.md`.

### Performance

Mesure faite dans mon conteneur, `@resvg/resvg-js` en 1280x720, une scène avec 40 textes :
**environ 160 ms par image sur un coeur**. Pour 135 s à 30 images/s, soit 4050 images, ça
fait environ 11 minutes sur un coeur. Deux pistes :

- `worker_threads` avec N processus (option `--jobs`), le découpage par plage d'images est trivial.
- Construire la base de polices une seule fois et la réutiliser entre les images, au lieu de
  la recharger à chaque `new Resvg(...)`.

## Lot 2 — Format : taille de canevas et flou

- **Taille de canevas réelle.** `width`/`height` sont aujourd'hui figés à 1280x720. Il faut
  accepter au moins 1080x1350 (Instagram 4:5) et 1080x1920 (Reels). Pour l'instant je compose
  dans une zone 4:5 centrée dans le 1280x720 et je recadre après coup, ce qui gâche de la
  résolution. Attention : les décors procéduraux sont dessinés en coordonnées 1280x720, il
  faut les adapter ou les cadrer.
- **Propriété `blur`** (0 à 50 px, animable) sur les éléments et les groupes, rendue avec
  `feGaussianBlur`. J'ai vérifié que resvg gère bien les filtres. Aujourd'hui je simule le
  flou avec 24 copies décalées du même texte en faible opacité : ça marche visuellement mais
  ça alourdit chaque scène et ça ralentit le rendu.
- **Mesure de texte réelle** : retour à la ligne automatique calculé avec les métriques de la
  police, au lieu de couper les lignes à la main comme je le fais aujourd'hui.

## Lot 3 — Audio et minutage

Deux options, la première suffit si la seconde est trop lourde.

1. **Manifeste de minutage** : option `--emit-timeline timeline.json` qui exporte les instants
   exacts (en secondes globales) des événements : début de scène, apparition et disparition de
   chaque élément, et pour les quiz le début du compte à rebours et l'apparition de la réponse.
   Avec ça je génère et je cale la voix, la musique et les bruitages moi-même avec ffmpeg.
   C'est exactement ce qui m'a manqué : j'ai dû retrouver le décalage de 0,45 s en analysant
   les pixels de la vidéo exportée.
2. **Pistes audio dans le projet** : champ `audio` avec des entrées
   `{ id, src, start, gain, fadeIn, fadeOut }`, `src` étant un fichier local (jamais une URL
   externe, cohérent avec le modèle de sécurité actuel). Le CLI mixe avec ffmpeg et écrit une
   vidéo sonore. Aucune synthèse vocale ni génération musicale dans Animatelier : ça reste
   dehors, l'outil se contente de mixer des fichiers fournis.

## Lot 4 — Pilotage par un agent

- Ajouter un outil MCP `project_render_video` (arguments : `filename` ou `project`, `fps`,
  `format`, nom de sortie) qui appelle le même code que le CLI, avec le fichier écrit dans le
  dossier autorisé. Si le rendu dure plusieurs minutes, prévoir un job asynchrone et un
  `render_status`.
- Exposer aussi `compileQuiz` en CLI : `node apps/cli/quiz.js spec.json -o projet.json`,
  pour générer un projet sans passer par la page.
- Le plus simple pour moi : pouvoir faire `git clone`, `npm ci`, puis lancer le CLI. Publier
  le paquet sur npm serait un bonus, pas une nécessité.

### Contraintes réseau de mon côté (à prendre en compte)

Depuis mon conteneur, GitHub et le registre npm sont accessibles. Hugging Face et plusieurs
autres domaines sont bloqués. Donc : aucune dépendance qui télécharge une police, un modèle ou
un binaire ailleurs que sur npm ou GitHub, et tout doit fonctionner sans clé d'API.

## Critères d'acceptation

1. `node apps/cli/render.js examples/quiz-list.animatelier.json --out test.mp4` produit un MP4
   lisible, à la bonne durée (écart inférieur à une image), sur une machine Linux sans écran
   ni navigateur.
2. Le rendu est identique à celui de l'aperçu navigateur : comparer trois images clés
   (début de scène, milieu, révélation) entre `render_frame` et le CLI.
3. Deux exécutions successives donnent des fichiers au contenu identique (hash des images).
4. Aucune image sautée ni dupliquée : `ffprobe` doit montrer une cadence constante et
   `durée × fps` images.
5. Le texte s'affiche avec la police embarquée, accents compris, sur une machine qui n'a
   ni Arial ni police système.
6. `npm test` et `npm run build` passent, et le README ainsi que REPRISE.md décrivent la
   commande et ses limites.

## Ordre conseillé

Lot 1 d'abord (il débloque tout le reste), puis le manifeste de minutage du lot 3, puis la
taille de canevas et le flou du lot 2, et enfin l'outil MCP du lot 4.
