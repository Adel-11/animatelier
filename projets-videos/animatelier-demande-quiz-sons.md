# Demande : quiz sonores dans le mode `levels` (QFF)

Contexte : on ajoute à QFF des quiz où la question est un son (cri d'animal, hymne national, instrument de musique,
bruit du quotidien...). La vidéo reste un Reel 9:16 en mode `levels`, avec le preset `qff-reel`.
Aujourd'hui l'outil ne gère que la voix, la musique et les sfx. Le but est que je puisse écrire une spec JSON,
déposer les fichiers son à côté des images, et obtenir la vidéo et les pistes audio sans script maison.

Principe d'une question sonore :

1. la voix lit la question (« Which animal makes this sound? ») ;
2. phase d'écoute : le son joue seul, quelques secondes (plus long pour un hymne), avec un visuel animé ;
3. compte à rebours ;
4. révélation : texte de la réponse plus une image (photo de l'animal, drapeau, instrument), ou bien révélation
   groupée à la fin du quiz.

## 1. Nouveaux champs de question

```json
{
  "q": "Which animal makes this sound?",
  "a": "Lion",
  "audio": "file:lion.ogg",
  "audioStart": 1.2,
  "listen": 4,
  "revealImage": "file:lion.jpg",
  "replayOnReveal": false
}
```

- `audio` : `file:` ou `asset:`, formats mp3, ogg, opus, wav, flac.
- `audioStart` (s, défaut 0) : point de départ dans le fichier, pour sauter un silence ou une intro.
- `listen` (s) : durée de la phase d'écoute. Défaut dans `timing.listen`. Le son est coupé à `listen` avec un
  fondu de sortie de 0,3 s et un fondu d'entrée de 0,05 s. Si le fichier est plus court que `listen`, la phase
  s'arrête à la fin du son (avec `readPad`), pas de silence inutile.
- `audioGain` (dB, optionnel) : correction manuelle après la normalisation automatique (voir plus bas).
- `revealImage` : image affichée seulement à la révélation. Pendant l'écoute et le compte à rebours, rien ne doit
  la trahir (pas de miniature, pas de flou). Doit fonctionner avec `imageLayout: "hero"` et avec un QCM.
- `image` garde son sens actuel (image visible dès la question). Les deux peuvent coexister.
- `replayOnReveal` (bool, défaut false) : rejoue le son sous l'image de réponse, après la voix de la réponse
  (jamais par-dessus la voix).
- `audioDuringCountdown` : `"stop"` (défaut), `"continue"` (le son continue pendant le compte à rebours, jusqu'à
  `listen + countdown` au maximum) ou `"loop"`.

À la racine ou dans `defaults` : les mêmes champs doivent pouvoir être donnés une fois pour tout le quiz
(par exemple `defaults.listen: 8` pour les hymnes), et surchargés question par question.

## 2. Minutage

- Nouvelle phase `listen` entre `read` et `countdown`, avec `timing.listen` (défaut 4), `timing.listenMin`,
  `timing.listenMax`.
- La réduction automatique pour tenir dans `maxDuration` ne doit **pas** raccourcir `listen` avant d'avoir épuisé
  `answer` et `read`. Si ça ne tient toujours pas, avertissement clair dans `--check` avec la durée obtenue.
- `timeline.json` : pour chaque question, ajouter `listenStart`, `listenEnd`, le fichier source, `audioStart` et la
  durée réellement jouée.
- `voice-script.json` : aucun créneau de voix ne doit tomber dans une phase d'écoute.
- `--sfx default` : pas de souffle de transition ni de tic pendant l'écoute. Les tics reprennent au compte à rebours.

## 3. Visuel pendant l'écoute

Le panneau de question est vide d'image, il faut quelque chose de vivant et lisible :

- une icône haut-parleur ou note de musique au centre, et une étiquette « LISTEN » à la couleur du niveau ;
- un visualiseur **calculé à partir du vrai son** (barres d'égaliseur ou forme d'onde qui avance), avec l'enveloppe
  extraite au moment de la compilation. Rendu déterministe (même son, mêmes images) ;
- une barre ou un anneau qui montre le temps d'écoute restant ;
- style réglable dans le thème (`listenVisual: "bars" | "wave" | "pulse"`, couleurs héritées du thème) et
  surchargeable par `layout` comme les autres éléments (ids du type `listen_icon`, `listen_label`, `listen_viz`).

Le texte de la question reste affiché pendant l'écoute (sans flou, même si `questionEffect` est `blur`, sinon on ne
sait pas quoi écouter). L'effet `questionEffect` peut s'appliquer seulement pendant le compte à rebours.

## 4. Révélation à la fin du quiz (option)

`revealMode: "each"` (défaut, comme aujourd'hui) ou `"end"`.

En mode `"end"` :

- après le compte à rebours, pas de panneau réponse, on enchaîne sur la question suivante (courte transition) ;
- avant l'outro, une séquence « ANSWERS » : une carte par question (numéro, `revealImage`, texte de la réponse), ou
  une grille de 5 réponses par niveau. Durée par carte réglable (`timing.recapItem`, défaut 1,6 s) ;
- `voice-script.json` contient les créneaux de ce récapitulatif (« Number one, the lion. Number two... ») ;
- la barre de progression se remplit à la fin de chaque question, pas à la révélation.

## 5. Audio en sortie (le point le plus important pour moi)

Je fais mon propre mixage (voix à -16 LUFS, musique à -30 LUFS avec ducking, sfx à -8 dB, limiteur suréchantillonné).
J'ai donc besoin de pistes séparées, alignées sur la vidéo :

- `--sounds-out sounds.wav` : une piste 48 kHz stéréo qui contient **uniquement les sons des questions**, placés
  sur la timeline, coupés, fondus, et normalisés un par un à un niveau commun (proposition : -18 LUFS intégrés par
  clip, puis `audioGain`). Un cri de loup et un hymne d'orchestre doivent sortir au même volume perçu ;
- `timeline.json` doit me donner les fenêtres d'écoute pour que je coupe complètement la musique pendant ces
  phases (ou, mieux : option `--music-duck-listen off` si la musique est mixée par l'outil) ;
- `mux-audio.js` : accepter plusieurs pistes (`--audio voix.wav --audio sounds.wav ...`) ou, plus simple, me laisser
  fournir le mix final comme aujourd'hui. Les deux conviennent.
- Garder la règle actuelle : pas de boîte `elst`, AAC 128k 48 kHz.

## 6. Aide à la production

- `--check` : vérifie que chaque fichier `audio` existe et se décode, donne sa durée et son niveau (LUFS, crête),
  signale un son plus court que `listen`, un son quasi silencieux ou saturé, et une `revealImage` manquante.
- `--preview auto` : la planche contact doit inclure une image de la phase d'écoute d'au moins une question.
- `fetch-assets.js` : accepter les fichiers audio (mêmes règles que les images : refuser un fichier qui n'est pas un
  son, garder la source dans un fichier `sources.txt` ou dans le manifeste).
- Une commande pour écouter vite un résultat serait utile : `--audio-preview` qui sort un mp3 du quiz (voix de
  synthèse absente, juste sons et sfx aux bons instants) sans rendre la vidéo, pour vérifier le calage.

## 7. Couverture

Même règle que maintenant (titre, logo, petite illustration). Ajouter un élément prêt à l'emploi pour les quiz
sonores, par exemple une icône d'onde sonore ou de casque dessinée en SVG par l'outil, utilisable en
`intro.elements` avec un simple `{"type": "icon", "name": "sound"}`, pour ne pas dépendre d'une image externe.

## 8. Critères d'acceptation

1. Une spec de 15 questions avec `audio`, `listen` 4 s, `revealImage` et `revealMode: "each"` produit la vidéo,
   `sounds.wav`, `timeline.json` et `voice-script.json` cohérents : chaque son commence à `listenStart` à une image
   près, aucune voix ni sfx dans les phases d'écoute.
2. La même spec en `revealMode: "end"` produit la séquence de récapitulatif avant l'outro, avec ses créneaux de voix.
3. Deux sons de niveaux très différents ressortent à moins de 1 LU d'écart dans `sounds.wav`.
4. Le visualiseur suit le son (un silence au milieu du clip se voit) et deux rendus donnent le même hash de pixels.
5. `--check` signale un fichier audio absent, corrompu ou trop court, sans rendre.
6. `npm test` et `npm run build` passent. `docs/QUIZ-VIDEO.md` documente les nouveaux champs avec un exemple
   complet (`examples/quiz-sons.json`), et REPRISE.md est à jour.
