# Rendu vidéo CPU, sans navigateur

Node 22.12+ ; `git clone`, puis `npm ci`. Aucune clé, aucun écran ou service Netlify requis. Les dépendances viennent de npm ; `ffmpeg-static` récupère son binaire depuis les releases GitHub d’eugeneware/ffmpeg-static. Une fois installé, le rendu fonctionne hors réseau.

```sh
node apps/cli/render.js examples/quiz-list.animatelier.json --out sortie.mp4 --jobs 4 --emit-timeline timeline.json
node apps/cli/render.js projet.json --out sortie.webm --format webm --fps 30 --crop 352,0,576,720 --scale 1080x1350
node apps/cli/quiz.js spec.json -o projet.json
```

`--overwrite` autorise explicitement le remplacement des sorties CLI. Le format est inféré de `.webm` si `--format` est absent ; sinon MP4. `ANIMATELIER_FFMPEG` peut désigner un exécutable ffmpeg installé. Les arguments sont transmis sans shell. Un JSON importé est limité à 5 Mo et passe par le validateur core.

## Temps et images

L’image f est calculée au temps global `f / fps`. Le nombre d’images est `ceil(durée × fps)` ; la durée encodée excède donc la durée du projet de moins d’une image. Le CLI utilise le fps du projet, sauf option `--fps` (1–60). MP4 : H.264, yuv420p ; WebM : VP9, yuv420p. Les dimensions finales doivent être paires. `--crop x,y,w,h` travaille en pixels du canevas, avant `--scale largeurxhauteur` (qui peut déformer le ratio).

Le calcul SVG/raster est distribué à 1–16 workers (`--jobs`, défaut 1). Chaque worker conserve son projet ; une seule image par worker est en attente. Les lots sont écrits dans l’ordre, avec contre-pression de ffmpeg. Le résultat n’est publié qu’après succès de l’encodeur, sans écraser un fichier existant par défaut. Les fichiers temporaires sont nettoyés sur erreur gérée ; une interruption brutale du processus peut en laisser un.

Les trois références SHA-256 portent sur les pixels RGBA à 0, 1,5 et 3 secondes du quiz, et sont vérifiées par `npm test`, y compris en CI Linux/Node 22. Les octets du conteneur vidéo ne constituent pas une promesse de reproductibilité entre versions de ffmpeg. Le MCP `render_frame` et le CLI utilisent le même rasteriseur resvg à la résolution native. Le navigateur partage le SVG et les polices ; son anticrénelage natif peut différer de resvg.

## Canevas, police et texte

Champs v2 compatibles : `width` et `height` entiers de 16 à 4096, `fps` de 1 à 60, `fontFamily` optionnel parmi `DejaVu Sans` (défaut) et `DejaVu Sans Mono`. Les formats 1080×1350 et 1080×1920 sont acceptés. Charger le JSON validé via l’éditeur/API pour changer le format. Les décors procéduraux sont cadrés au centre avec couverture du canevas ; les coordonnées des objets restent des pixels natifs et ne sont pas redimensionnées automatiquement. Le compilateur quiz continue à composer en 1280×720.

Les polices regular/bold sont dans `assets/fonts` avec leur licence. Resvg est configuré avec `loadSystemFonts:false` et ces seuls fichiers. Le navigateur charge les mêmes TTF ; les captures et exports navigateur les embarquent dans le SVG image. Les anciens projets utilisent désormais DejaVu Sans plutôt que la police Arial de la machine : les coupures et espacements peuvent changer.

Un élément texte peut fournir `maxWidth` en pixels locaux pour le retour automatique à la ligne. La mesure additionne les avances réelles des glyphes extraites des TTF. Crénage et ligatures sont désactivés pour partager ces avances. Les sauts de ligne explicites sont conservés ; les mots trop longs sont découpés par points de code. Les bulles, titres et nouveaux quiz utilisent aussi ces métriques. Pas de composition typographique avancée pour scripts complexes ni de polices personnalisées externes.

`blur` : 0–50 px locaux sur tous les éléments, groupes inclus, animable via `keyframes.blur`. Filtre SVG `feGaussianBlur` commun à tous les rendus. Un flou de groupe s’applique à sa composition. Les régions de filtre sont élargies mais finies ; des objets extrêmement petits avec un grand flou peuvent être rognés par la région SVG. Les grandes résolutions et filtres augmentent mémoire et temps CPU. L’API resvg-js ne propose pas de base de polices réutilisable entre constructeurs ; cette optimisation n’est pas livrée.

## Manifeste et audio

`--emit-timeline` écrit les événements globaux en secondes : `scene_start/end`, `actor_appear/disappear`, `element_appear/disappear`, `quiz_countdown_start`, `quiz_answer_reveal`. La présence des enfants est bornée par celle des groupes. Les événements représentent les plages start/end, pas les changements d’opacité, les masques ou les sorties de champ ; les fins suivent la convention inclusive du core. Les quiz sont reconnus par les IDs stables `timer`, `question`, `answer_label` générés par compileQuiz. Renommer ces IDs retire les événements quiz spécifiques.

Le manifeste permet le montage audio externe avec ffmpeg. La variante de mixage audio intégré du cahier des charges n’est pas implémentée ; les vidéos produites sont silencieuses.

## MCP

`project_render_video` accepte `filename` (JSON dans le dossier autorisé) OU `project`, ou utilise la session courante si les deux sont absents ; `out`, `fps`, `format` et `jobs` (1–4) configurent le rendu. Les noms de sortie sont simples, terminés par `.mp4`/`.webm`, et ne sont jamais écrasés. Le projet est capturé et validé au lancement, sans modifier la révision de session.

Réponse immédiate `{jobId,status,frame,total}`. Appeler `render_status({jobId})` jusqu’à `completed` (avec `result.path`) ou `failed` (avec `error`). Un seul rendu actif par serveur ; les 20 derniers jobs restent en mémoire. Garder le serveur connecté jusqu’à la fin. Pas de reprise durable ni d’annulation MCP. Le CLI et le MCP appellent `packages/headless/video.ts` ; aucune dépendance Node n’entre dans core ou renderer.
