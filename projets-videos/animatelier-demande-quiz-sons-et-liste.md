# Demande : quiz sonores et nouveau format « liste qui se remplit » (QFF)

Deux ajouts pour les Reels QFF, à faire dans cet ordre :

- **Partie A**, questions sonores (cri d'animal, hymne national, instrument, bruit du quotidien), utilisables dans
  le mode `levels` actuel et dans le nouveau mode de la partie B.
- **Partie B**, nouveau mode `stack` : titre en haut, image au centre, liste numérotée qui se remplit réponse
  après réponse, sur un fond flou (photo ou vidéo) qui change.
- **Partie C**, règles de rétention à appliquer aux deux modes.

Le but reste le même : j'écris une spec JSON, je dépose les fichiers (images, sons, vidéos) à côté, et je reçois la
vidéo et les pistes audio sans script maison. Contraintes inchangées : pas de boîte `elst`, AAC 128k 48 kHz,
rendu déterministe.

---

## Partie A. Questions sonores

### A1. Déroulé d'une question sonore

1. la voix lit la question (« Which animal makes this sound? »), ou juste un titre à l'écran en mode `stack` ;
2. phase d'écoute : le son joue seul quelques secondes (plus long pour un hymne), avec un visuel animé ;
3. compte à rebours (optionnel en mode `stack`) ;
4. révélation : texte de la réponse et image (photo de l'animal, drapeau, instrument), ou révélation groupée à
   la fin du quiz.

### A2. Champs de question

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
- `listen` (s) : durée d'écoute. Défaut dans `timing.listen`. Coupure à `listen` avec fondu de sortie 0,3 s et
  fondu d'entrée 0,05 s. Si le fichier est plus court, la phase s'arrête à la fin du son (plus `readPad`).
- `audioGain` (dB, optionnel) : correction manuelle après la normalisation automatique (A5).
- `revealImage` : image montrée seulement à la révélation. Rien ne doit la trahir avant (pas de miniature, pas de
  flou). Compatible `imageLayout: "hero"`, QCM et mode `stack`.
- `image` garde son sens actuel (visible dès la question). Les deux peuvent coexister.
- `replayOnReveal` (défaut false) : rejoue le son sous l'image de réponse, après la voix, jamais par-dessus.
- `audioDuringCountdown` : `"stop"` (défaut), `"continue"` (jusqu'à `listen + countdown` au maximum) ou `"loop"`.

Tous ces champs doivent pouvoir se donner une fois dans `defaults` (par exemple `defaults.listen: 8` pour les
hymnes) et se surcharger question par question.

### A3. Minutage

- Nouvelle phase `listen` entre `read` et `countdown` : `timing.listen` (défaut 4), `listenMin`, `listenMax`.
- La réduction automatique pour tenir dans `maxDuration` ne raccourcit `listen` qu'en dernier, après `answer` et
  `read`. Si ça ne tient toujours pas, avertissement clair dans `--check` avec la durée obtenue.
- `timeline.json` : par question, `listenStart`, `listenEnd`, fichier source, `audioStart`, durée jouée.
- `voice-script.json` : aucun créneau de voix dans une phase d'écoute.
- `--sfx default` : ni souffle ni tic pendant l'écoute. Les tics reprennent au compte à rebours.

### A4. Visuel pendant l'écoute

- icône haut-parleur ou note au centre, étiquette « LISTEN » à la couleur du niveau ;
- visualiseur **calculé à partir du vrai son** (barres ou onde qui avance), enveloppe extraite à la compilation,
  rendu déterministe ;
- barre ou anneau du temps d'écoute restant ;
- style dans le thème (`listenVisual: "bars" | "wave" | "pulse"`), surchargeable par `layout`
  (ids `listen_icon`, `listen_label`, `listen_viz`) ;
- le texte de la question reste net pendant l'écoute même si `questionEffect` vaut `blur` (l'effet ne s'applique
  qu'au compte à rebours).

### A5. Audio en sortie (le plus important pour moi)

Je fais mon propre mixage (voix -16 LUFS, musique -30 LUFS avec ducking, sfx -8 dB, limiteur suréchantillonné).
Il me faut des pistes séparées, alignées sur la vidéo :

- `--sounds-out sounds.wav` : 48 kHz stéréo, **uniquement les sons des questions**, placés, coupés, fondus et
  normalisés un par un au même niveau (proposition : -18 LUFS intégrés par clip, puis `audioGain`). Un cri de loup
  et un hymne d'orchestre doivent sortir au même volume perçu ;
- les fenêtres d'écoute dans `timeline.json` pour que je coupe la musique pendant ces phases (et, si l'outil mixe
  lui-même la musique, une option qui la coupe pendant l'écoute) ;
- `mux-audio.js` : accepter plusieurs `--audio`, ou continuer à prendre mon mix final. Les deux conviennent.

### A6. Révélation groupée à la fin (mode `levels`)

`revealMode: "each"` (défaut, comme aujourd'hui) ou `"end"`. En `"end"` : pas de panneau réponse après le compte à
rebours, courte transition, puis avant l'outro une séquence « ANSWERS » (une carte par question avec numéro,
`revealImage` et réponse, ou une grille de 5 par niveau, `timing.recapItem` défaut 1,6 s). `voice-script.json`
contient les créneaux du récapitulatif. La barre de progression se remplit en fin de question.

---

## Partie B. Nouveau mode `stack` : liste qui se remplit

Référence visuelle (captures envoyées par Adel, compte @quizlax, « Guess the animals ») : bandeau titre rouge en
haut, image encadrée au centre, liste 1 à 10 à gauche avec des numéros de couleurs différentes, les réponses
s'inscrivent au fur et à mesure, le fond (paysage) change d'une question à l'autre. Format court, sans
présentateur, qui donne envie de voir la liste complète.

### B1. Spec proposée

```json
{
  "mode": "stack",
  "format": "reel-9x16",
  "language": "en",
  "title": "GUESS THE ANIMALS",
  "hook": "Can you get all 10?",
  "titleStyle": { "bg": "#E21B1B", "color": "#FFFFFF", "stroke": "#000000" },
  "background": {
    "src": "file:forest.mp4",
    "blur": 18,
    "dim": 0.25,
    "motion": "kenburns",
    "change": "per-item"
  },
  "list": {
    "numberColors": ["#FFE600", "#FFE600", "#FFE600", "#39E639", "#39E639", "#39E639",
                     "#FF2D2D", "#FF2D2D", "#FF2D2D", "#FF2DD4"],
    "align": "left",
    "showEmptySlots": true
  },
  "items": [
    { "image": "file:fox.jpg", "a": "Fox", "bg": "file:bg-mountain.jpg" },
    { "audio": "file:wolf.ogg", "listen": 4, "revealImage": "file:wolf.jpg", "a": "Wolf" }
  ],
  "timing": { "show": 2.2, "countdown": 0, "reveal": 0.7, "endHold": 1.5 },
  "end": { "text": "How many did you get?", "loop": true }
}
```

### B2. Mise en page 9:16

- **haut** : bandeau titre (style réglable : fond, contour, ombre, police grasse), et `hook` en dessous pendant
  les 2 premières secondes seulement ;
- **centre** : cadre image (bordure réglable, `imageFit: cover|contain`) ; pour une question sonore, le visualiseur
  de A4 occupe le cadre pendant l'écoute, puis `revealImage` le remplace ;
- **réponse en haut** : à la révélation, la réponse s'affiche en grand sous l'image ou dans le titre (option
  `answerPlacement: "under-image" | "title"`), puis **glisse jusqu'à sa ligne** dans la liste (animation de
  0,4 s). C'est ce mouvement qui rend la liste vivante ;
- **liste** : numéros toujours visibles (cases vides qui créent l'envie de compléter), couleur des numéros par
  palier de difficulté, texte en capitales avec contour noir pour rester lisible sur n'importe quel fond ;
  hauteur de ligne et taille auto selon le nombre d'items (5 à 15) ;
- **zones sûres** : rien d'important dans le bas (légende et pseudo Instagram) ni dans la colonne droite
  (boutons j'aime, commentaire, partage). Sur la capture, la liste est à gauche justement pour ça. Prévoir un
  calque de débogage `--safe-zones` dans l'aperçu.

### B3. Fond

- image ou **vidéo** (mp4, webm), flou gaussien réglable, assombrissement (`dim`) ;
- vidéo : frames extraites à la compilation au bon fps, bouclée si trop courte, sans son, rendu déterministe ;
- `motion: "kenburns"` pour une image fixe (zoom lent 1.00 à 1.08 sur la durée de l'item) ;
- `change: "per-item" | "fixed" | "per-level"`, avec `bg` par item ; transition courte (fondu 0,3 s ou coupe) ;
- si `bg` absent, option `bgFromImage: true` : le fond est l'image de la question elle-même, très floutée
  (pratique, pas besoin de chercher un second visuel).

### B4. Minutage et son

- par item : `show` (image visible, le spectateur réfléchit), compte à rebours optionnel (anneau discret en haut
  à droite du cadre si `countdown > 0`), `reveal` ;
- items sonores : `listen` s'ajoute avant `show` ;
- voix optionnelle (`voice.enabled`), par défaut uniquement la réponse (« Fox! ») ; le minutage `read: "voice"`
  fonctionne comme en `levels` ;
- `--sfx default` : un « pop » à l'inscription dans la liste, un tic léger par seconde si compte à rebours,
  un son final quand la liste est complète ;
- mêmes sorties que `levels` : `timeline.json`, `voice-script.json`, `sounds.wav`, `cover.jpg`, `preview.jpg`.

### B5. Fin et boucle

- à la fin : liste complète affichée `endHold` secondes avec `end.text` (appel au commentaire) ;
- `loop: true` : la dernière image redevient visuellement la première (titre, liste vide, même fond) par un fondu
  court, pour que la relecture automatique d'Instagram s'enchaîne sans coupure visible ;
- pas d'écran logo, pas d'outro longue dans ce mode : le logo peut être un petit badge dans un coin (option).

---

## Partie C. Règles de rétention (à appliquer aux deux modes)

Ce que j'ai trouvé sur l'algorithme des Reels en 2026 : le temps de visionnage et le **taux de relecture** sont le
premier signal, les **partages en message privé** pèsent nettement plus que les j'aime, et les **3 premières
secondes** décident de la première diffusion. Côté rétention, on vise plus de 40 % de visionnage moyen sur 30 à 60 s.
Conséquences pour l'outil :

1. **Rien à attendre au début.** La première image montre déjà le titre, la liste vide et la première image.
   En mode `levels`, rendre possible `intro.logoSeconds: 0` avec le titre et le logo sur la même image.
2. **Boucle ouverte visible.** Les cases vides de la liste (ou la barre de progression) restent visibles tout le
   long : le spectateur veut voir la fin.
3. **Changement visuel toutes les 2 à 3 secondes** (nouvelle image, nouveau fond, réponse qui glisse). Pas de plan
   fixe plus de 4 s, sauf l'écoute d'un son, où le visualiseur bouge.
4. **Difficulté croissante visible** (couleur des numéros ou des niveaux) : le spectateur reste pour le palier
   difficile.
5. **Court par défaut.** Mode `stack` : 10 items autour de 2,5 à 3 s chacun, soit 30 à 40 s. Les durées courtes
   favorisent la relecture.
6. **Lisible sans le son** : réponses écrites en grand, contraste fort, contour noir.
7. **Fin qui relance** : texte d'appel au commentaire ou au partage (« Send this to a friend who can't get 10/10 »)
   pendant la dernière seconde, puis boucle.
8. **Pas de filigrane**, et toujours une piste audio (même discrète).

L'outil n'a pas à décider du contenu, mais ces réglages doivent être des valeurs par défaut du preset
`qff-stack` (à créer, comme `qff-reel`).

---

## Aide à la production (commun)

- `--check` : fichiers `audio`, `bg` et images présents et lisibles, durée et niveau des sons (LUFS, crête), son
  plus court que `listen`, son quasi muet ou saturé, `revealImage` manquante, texte de liste qui déborde, durée
  totale.
- `--preview auto` : inclure une image de phase d'écoute et une image de liste à moitié remplie.
- `--safe-zones` : calque des zones Instagram dans l'aperçu.
- `fetch-assets.js` : accepter audio et vidéo (refuser ce qui n'en est pas, garder la source dans le manifeste).
- `--audio-preview` : mp3 rapide avec sons et sfx aux bons instants, sans rendre la vidéo.
- Couverture : élément `{"type": "icon", "name": "sound"}` (onde ou casque en SVG) utilisable dans
  `intro.elements`, et pour `stack` une couverture automatique (titre plus liste vide plus première image).

## Critères d'acceptation

1. Mode `levels`, 15 questions avec `audio`, `listen` 4 s et `revealImage` : vidéo, `sounds.wav`, `timeline.json`
   et `voice-script.json` cohérents, chaque son démarre à `listenStart` à une image près, aucune voix ni sfx
   pendant l'écoute.
2. La même spec en `revealMode: "end"` produit le récapitulatif avant l'outro, avec ses créneaux de voix.
3. Deux sons de niveaux très différents ressortent à moins de 1 LU d'écart dans `sounds.wav`.
4. Le visualiseur suit le son (un silence au milieu se voit), et deux rendus donnent le même hash de pixels.
5. Mode `stack`, 10 items dont 3 sonores, fond vidéo flouté : la liste se remplit avec l'animation de glissement,
   rien d'important dans les zones Instagram, et avec `loop: true` la dernière image fond vers une image identique
   à la première.
6. `--check` signale un son absent, corrompu ou trop court, et un fond vidéo illisible, sans rendre.
7. `npm test` et `npm run build` passent. `docs/QUIZ-VIDEO.md` documente tout avec deux exemples complets
   (`examples/quiz-sons.json`, `examples/quiz-stack.json`), et REPRISE.md est à jour.
