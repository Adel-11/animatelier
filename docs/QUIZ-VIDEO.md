# Quiz vidéo en une commande

```sh
node apps/cli/quiz-video.js spec.json --out out/ --theme qff --assets-dir . --jobs 4 --target instagram-reel
node apps/cli/quiz-video.js spec.json --theme light --check
node apps/cli/quiz-video.js spec.json --out out-audio/ --assets-dir . --audio mix.wav --sfx default --preview auto
```

Le compilateur accepte les modes `choices`, `list` et `levels`. Voir [QUIZ.md](QUIZ.md) pour la spec, les thèmes et les formats. `--theme` accepte un nom embarqué ou un fichier JSON. Les surcharges de thème de la spec restent prioritaires champ par champ. Les références `file:` sont résolues sous `--assets-dir` ; le logo QFF est résolu depuis le kit du dépôt indépendamment de ce dossier et du répertoire courant. Les autres logos `file:` sont relatifs au dossier du fichier thème, ou à `--assets-dir` pour un thème directement dans la spec. Le projet sauvegardé embarque ses images et fonctionne ensuite hors réseau.

La commande publie six fichiers : `video.mp4`, `project.json`, `timeline.json`, `voice-script.json`, `cover.jpg` et `preview.jpg`. Les fichiers sont préparés dans un dossier temporaire et publiés seulement après réussite. Toute sortie existante provoque un refus ; choisir un autre dossier pour une nouvelle version. Il n’existe pas d’écrasement implicite. `--check` valide, résout les images et retourne durée, nombre d’images et avertissements de mise en page, sans rendu ni écriture.

Le profil par défaut, `instagram-reel`, encode H.264 High, yuv420p, 30 images/s constantes, CRF 27, tune animation, GOP fermé de 60 images, faststart et aucune liste d’édition MP4 (`elst`). Le canevas vient du format du quiz : sélectionner `reel-9x16` pour 1080 × 1920. Le profil ne recadre pas silencieusement les autres formats. `--audio mix.wav` ajoute AAC 128 kbit/s, 48 kHz stéréo avec copie du flux vidéo ; les pistes courtes sont complétées de silence, les longues tronquées à la durée vidéo. AAC peut ajouter un léger délai d’encodage et du padding en l’absence de liste d’édition.

`--sfx default` synthétise des tics, révélations, montées de niveau et transitions à partir des événements du minutage. Avec `--audio`, les deux pistes sont mélangées. Pour personnaliser, passer `--sfx sons.json` : un objet indexé par type d’événement, chaque valeur contenant `frequency` (40–12000 Hz), `duration` (0.01–3 s), `gain` (0–0.8, défaut 0.15) et `sweep` (variation totale en Hz, défaut zéro). `null` désactive un son. Types par défaut : `tick`, `reveal`, `level`, `question`. Synthèse déterministe, aucun fichier sonore téléchargé ; maximum 3600 secondes.

`--cover-at 1` choisit l’instant de couverture (défaut : 1 s, ou milieu pour les vidéos plus courtes). `--cover chemin.jpg` change son emplacement. La couverture conserve le format du projet. `--preview auto` sélectionne au plus 24 instants clés ; `--preview 0,3,8.5` choisit explicitement les instants. La planche garde l’ordre demandé, avec quatre colonnes maximum. Tous les instants doivent précéder la fin de la vidéo.

Le nombre de workers par défaut suit les cœurs disponibles, plafonné à 16 et réduit selon la mémoire libre et la taille du canevas. `--jobs 1` à `--jobs 16` le fixe explicitement. Chaque worker conserve seulement son dernier SVG haché et son raster ; un SVG identique réutilise les pixels. Le cache ne change ni le minutage ni le résultat et sa mémoire reste bornée. Le cache de calques partiels n’est pas implémenté : resvg rasterise la scène entière dès que son SVG change.

La commande valide un profil de fichier ; elle ne publie rien sur Instagram et ne garantit pas l’acceptation par la plateforme. Les vidéos et scripts de référence absents du dépôt doivent être fournis pour une comparaison visuelle exacte.
