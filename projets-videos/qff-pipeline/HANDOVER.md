# QFF (Quiz Factory Forever) : passation complète

Rédigé le 23 septembre 2026 par l'agent qui produit les vidéos, pour l'agent qui prendra la suite.
Tout ce qui suit a été fait et vérifié, sauf mention explicite du contraire.

---

## 1. Le projet

Adel publie des vidéos quiz au format Reel Instagram sous le nom **QFF, Quiz Factory Forever**.
Comptes : Instagram **@quiz.factory.forever** (id `17841432634177522`), Page Facebook id `1348258481705058`.

Contraintes de fonctionnement demandées par Adel :

- Tout se fabrique **dans le cloud**, son ordinateur peut être éteint.
- La publication passe par **son instance n8n**, jamais en manuel.
- **Ne rien publier sans son autorisation explicite.** Il la donne vidéo par vidéo.
- **Facebook : une seule tentative par publication** (voir l'erreur 368 plus bas).
- Ne pas contourner la politique réseau de l'organisation. Si un domaine est bloqué, lui demander de l'autoriser.
- Réponses en français, ton direct, pas de tirets longs, style le moins « IA » possible, et honnêteté sur ce qui n'est pas testé.

Au 23 sept (2e session), `api.flickr.com`, `api.openverse.org` et `github.com` répondent aussi.
Domaines réseau autorisés à l'origine : `n8n.letter-bird.com`, `drive.google.com`, `commons.wikimedia.org`,
`upload.wikimedia.org`. Tout le reste est bloqué par le proxy (`en.wikipedia.org` et `thumb.wikimedia.org` le sont).

---

## 2. Animatelier, l'outil de fabrication

- Dépôt : https://github.com/Adel-11/animatelier
- Dossier local d'Adel : `C:\Users\mekka\Documents\03-Projets\Animatelier`
- Site : animatelier.netlify.app (éditeur navigateur, pas nécessaire pour produire)
- Clone cloud : `git clone` puis `npm ci`. Dernier commit utilisé : **1c1d79e** « feat: expand modular quiz authoring ».
- Un autre agent développe l'outil. On lui envoie des demandes écrites, il livre, on teste.

### 2.1 Commandes utilisées

```sh
# validation sans rendu (durée, avertissements de mise en page)
node apps/cli/quiz-video.js spec.json --assets-dir img/ --check

# rendu complet
node apps/cli/quiz-video.js spec.json --out out/ --assets-dir img/ \
  --voice-durations voice-durations.json --sfx default --preview auto \
  --cover-image brands/qff/logo.png --jobs 4

# ajout de l'audio sans re-rendre la vidéo
node apps/cli/mux-audio.js out/video.mp4 --audio voix-musique.wav --out final.mp4 --keep-sfx

# téléchargement d'images (proxy géré)
node apps/cli/fetch-assets.js manifest.json --out assets/
```

Sorties de `quiz-video.js` : `video.mp4` (muette ou avec bruitages), `project.json`, `timeline.json`,
`voice-script.json`, `cover.jpg`, `preview.jpg` (planche contact, essentielle pour vérifier sans regarder la vidéo).
**Le dossier de sortie ne doit pas exister**, sinon refus. Pas d'écrasement implicite.

Durée de rendu observée : environ **8 minutes pour 2 min 20 de vidéo** en 1080x1920 avec `--jobs 4`.
Lancer en arrière-plan (`nohup ... &`) et surveiller le log, sinon on dépasse le délai maximum d'une commande.

### 2.2 Ce que la spec sait faire (modes)

- `levels` : le seul mode vertical 9:16, avec niveaux, intro/outro, images, script vocal. **C'est celui qu'on utilise.**
- `choices`, `list`, `cards` : modes classiques, rendus en **1280x720 paysage**.
  Ils ont des fonctionnalités que `levels` n'a pas : mises en page `classic` / `game-show` / `minimal` / `presenter`,
  animations `fade` / `slide` / `pop`, présentateur animé, `hint`, `explanation`, `points`, libellés personnalisés.
  **Rien de tout cela n'est disponible en 9:16.** Si Adel veut un présentateur animé ou des indices dans un Reel,
  c'est une demande à faire à l'agent qui code l'outil.

### 2.3 Spec `levels`, champs utiles

Racine : `mode`, `format` (`reel-9x16`, `post-4x5`, `landscape`), `language` (`en` ou `fr`), `theme`,
`intro {title, subtitle, tagline, say}`, `questionEffect` (`blur`, `hide`, `none`), `imageLayout` (`compact` ou `hero`),
`imageCard`, `levels[]`, `outro {title, tiers[], cta[], say}`, `timing`.

Question : `q`, `a`, `choices[]` + `correctIndex` (QCM), `image` (`file:nom.jpg`), `imageEffect`
(`zoom`, `pixelate`, `blur`, `none`), `focusX`/`focusY` (0 à 1), `imageCard` (ou `null` pour la retirer),
`read` (durée fixe), `say`, `sayAnswer`.

`timing` : `read` (`auto`, un nombre, ou `"voice"`), `readPad` (0,3 par défaut), `readMin`, `readMax`,
`countdown` (entier), `answer`, `answerMin`, `levelCard`, `outro`, `maxDuration`.

Points appris à l'usage :

- `imageLayout: "hero"` est indispensable pour les quiz d'images : la photo occupe presque toute la largeur.
  En `compact` elle fait environ 310 px de haut, c'est trop petit.
- **Un QCM réduit fortement la photo** : les quatre cartes prennent le bas du panneau. Pour un quiz où l'image
  est la question (logos, yeux), mieux vaut des réponses ouvertes.
- `imageCard` (carte blanche derrière l'image) est nécessaire pour les logos noirs sur fond bleu nuit,
  inutile et même gênant pour des photos.
- Le **zoom est fixé à x3 dans le code**, il n'est pas réglable par la spec. Pour ne montrer que les yeux,
  il faut pré-recadrer la photo (voir `scripts/crop_faces.py`).
- `theme` accepte un nom (`qff`, `default`, `light`, `game-show`, `neon`, `paper`) ou un objet avec `extends`.
  Exemple utilisé sur les deux derniers quiz :
  `{"extends":"qff","backdrop":{"type":"linear","color":"#07275F","color2":"#0B3E93","angle":160}}`.
  Attention, le dégradé rapproche la couleur des panneaux du fond, les panneaux se détachent un peu moins.

### 2.4 Thème QFF

Fond `#07275F`, panneaux `#0F3678`, piste `#1B478F`, texte `#FDF8E3`, atténué `#B7C3E6`, accent `#FECD1B`.
Niveaux : ROOKIE `#3DDC97`, MASTER `#FF8A3D`, GOAT `#FF4D6D`.
Logo : kit `brands/qff/` du dépôt, 860 px en intro (sert de couverture), 190 px en haut à gauche ensuite.

---

## 3. Chaîne de production complète

L'ordre compte : la voix se génère **avant** le rendu, parce que le minutage est calé sur elle.

1. **Écrire la spec** (15 questions, 3 niveaux de 5, `timing.read: "voice"`, `countdown: 3`, `answer: 2.8`).
   Les textes lus vivent dans `say` et `sayAnswer`, les textes affichés dans `q` et `a`. Écrire les nombres
   en toutes lettres dans les `say` (« One thousand four hundred and forty »), et les prononciations
   approximatives quand le TTS se trompe (« Hyun-day » pour Hyundai, « Citro-en » pour Citroën, « A U » pour Au).
2. **Générer les clips** : `python3 scripts/tts_clips.py spec.json clips/ voice-durations.json`
   (environ 4 minutes pour 32 clips, lancer en arrière-plan).
3. **Vérifier** : `node apps/cli/quiz-video.js spec.json --assets-dir img/ --voice-durations voice-durations.json --check`.
   Les avertissements « estimated Xs exceeds Ys » sont calculés sur la longueur du texte, pas sur le clip réel :
   comparer avec `clips/all-durations.json` avant de corriger. Le créneau intro ne fait que 3,5 s alors que
   l'intro parlée en fait 5 à 7, d'où le décalage à 0,3 s dans `place_voice.py`.
4. **Rendre** la vidéo (commande complète en 2.1).
5. **Contrôler la planche contact** `out/preview.jpg` avant d'aller plus loin.
6. **Placer la voix** : `python3 scripts/place_voice.py out/ clips/` (signale les chevauchements).
7. **Musique** : `python3 scripts/make_music.py out/`.
8. **Mixer** voix et musique (ducking latéral, voix à -15 LUFS avant mixage, le résultat final tombe vers -16) :

```sh
ffmpeg -y -i out/voice.wav -i out/music.wav -filter_complex \
"[0:a]highpass=f=80,acompressor=threshold=0.125:ratio=3:attack=5:release=120,loudnorm=I=-15:TP=-1.5:LRA=7,asplit=2[vo][vsc];\
[1:a]volume=6dB[mu];[mu][vsc]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=400[mud];\
[vo][mud]amix=inputs=2:normalize=0,alimiter=limit=0.95[out]" -map "[out]" -ar 48000 out/voix-musique.wav
```

9. **Muxer** : `node apps/cli/mux-audio.js out/video.mp4 --audio out/voix-musique.wav --out qff-xxx.mp4 --keep-sfx`
   (`--keep-sfx` conserve les bruitages déjà dans la vidéo).
10. **Vérifier l'encodage** avant publication :

```sh
ffprobe -v error -show_entries stream=codec_name,r_frame_rate,sample_rate,channels -of compact final.mp4
grep -c elst final.mp4                      # doit renvoyer 0
ffmpeg -i final.mp4 -af ebur128 -f null - 2>&1 | grep -A1 Integrated
```

Attendu : h264 30/1, aac 48000 Hz stéréo, aucune boîte `elst` (Instagram refuse les MP4 qui en ont), autour de -16 LUFS.

### 3.1 Voix

Coqui TTS, modèle anglais **LJSpeech VITS**, dans le scratchpad à `en_voice/tts_models--en--ljspeech--vits/`
(fichiers `model_file.pth.tar` et `config.json`, chemins internes déjà corrigés). `espeak-ng` est requis
(`apt-get install espeak-ng`). Le scratchpad étant lié à la session, **le prochain agent devra le retélécharger**
depuis la release `v0.8.0_models` du dépôt GitHub coqui-ai/TTS, puis corriger les chemins du `config.json`.
Installation vérifiée le 23 sept (2e session) : `download.pytorch.org` est bloqué, installer `torch torchaudio` depuis PyPI (~3 Go avec CUDA, 3 min),
puis `coqui-tts`, `transformers>=4.57,<4.58` (5.x casse l'import, 4.4x aussi) et `torchcodec` (obligatoire avec torch >= 2.9).
Le modèle se télécharge sans souci : `https://github.com/coqui-ai/TTS/releases/download/v0.8.0_models/tts_models--en--ljspeech--vits.zip`,
`config.json` utilisable tel quel. Passer le dossier par `QFF_TTS_DIR`. Le conteneur n'a que 2 cœurs : `--jobs 2`, rendu d'environ 5 min pour 2 min 34.
La reconnaissance vocale (Whisper, Hugging Face) est bloquée, on ne peut pas réécouter automatiquement les clips.
Réglage : `length_scale` du modèle pour accélérer un clip trop long, `librosa.effects.trim(top_db=38)` pour couper les silences.

---

## 4. n8n, publication

- Instance : `https://n8n.letter-bird.com`, accessible aussi par le MCP n8n.
- Workflow : **« QFF - Publier Reel »**, id **`m2aUOyCJcd0xNJY5`**.
- Credential utilisé : « Quiz Factory Forever Token » (id `03MdUW69UGjmzHAQ`).

### 4.1 Appel

```sh
curl -sS -m 300 -F video=@final.mp4 -F "caption=$CAP" -F dry_run=false -F facebook=true \
  "https://n8n.letter-bird.com/webhook/qff-publish?key=qffp4n8w2r6t"
```

Réponse immédiate `202` : `{"ok":true,"execution_id":"808","name":"qff_808","check":"video=... cover=..."}`.
Ensuite suivre l'exécution avec le MCP n8n (`get_workflow_execution`, `includeData: true`,
`nodeNames: ["Bilan","Lien Du Reel IG","Publier La Video Facebook"]`). Compter environ 80 secondes.

Champs acceptés : `video` (fichier) ou `video_url`, `caption`, `dry_run` (true = rien de public),
`facebook` (false pour sauter Facebook), `cover_at` (instant de la couverture, 1 s par défaut).

### 4.2 Fonctionnement interne

Nœuds, dans l'ordre : `Demande De Publication` (webhook) → `Parametres` → `Fichier Envoye` →
`Ecrire La Video Recue` (écrit `/home/node/.n8n-files/videos/qff_<execId>.mp4`) → `Extraire La Couverture`
(image à 1 s, `.jpg` à côté) → `Repondre Pris En Charge` (202) → `Token De La Page` → `Creer Le Conteneur Reel IG`
→ boucle `Attendre 20 Secondes` / `Statut Du Conteneur IG` / `Conteneur Pret` / `Encore Des Essais` →
`Mode Test` → `Publier Le Reel IG` → `Lien Du Reel IG` → `Resultat IG` → `Publier Sur Facebook` (aiguillage) →
`Relire La Video Pour Facebook` → `Publier La Video Facebook` → `Lire La Couverture` →
`Couverture De La Video Facebook` → `Lien De La Video Facebook` → `Bilan` (ou `Bilan Instagram Seul`).

Instagram est publié par **`video_url`**, servi par le même workflow :
`GET /webhook/qff-file?key=qffk7h2m9x4p&name=qff_<execId>.mp4` (et `.jpg` pour la couverture).
L'upload binaire `rupload` échoue au-delà de quelques Mo (ProcessingFailedError), ne pas y revenir.

### 4.3 Problèmes connus

- **Facebook, erreur 368** : la Page est bloquée par l'anti-spam de Meta depuis une boucle de test du 21 septembre
  (un nœud se rebouclait sur lui-même, plusieurs dizaines d'envois). Le nœud est corrigé, mais le blocage
  tient toujours au 23 septembre (trois tentatives espacées, toutes refusées). **Une seule tentative par publication**,
  jamais de rafale. Adel peut regarder l'état dans Meta Business Suite ou publier à la main entre-temps.
- **Miniature Facebook** : `Couverture De La Video Facebook` et `Lien De La Video Facebook` s'exécutent même quand
  l'upload de la vidéo a échoué, ce qui ajoute deux erreurs inutiles (« Object with ID 'thumbnails' does not exist »).
  À corriger avant de mettre en place les planifications.
- Les Reels Facebook par API sont limités à 90 s, d'où l'utilisation d'une vidéo de Page classique.

---

## 5. Vidéos produites

| Projet | Contenu | Durée | État |
|---|---|---|---|
| `qff-levels-1` | 15 questions culture générale, 3 niveaux, première vidéo au format QFF | 2 min 58 | Publié le 21 sept : https://www.instagram.com/reel/Ddja5bsCWg1/ |
| `qff-logos-1` | 15 logos de marques, compte à rebours 2 s | environ 2 min | Livré, non publié (remplacé par la v2) |
| `qff-logos-2` | Même quiz revu : compte à rebours 3 s, questions sans indice, minuteur calé sur la voix, logos en grand sur carte blanche | 2 min 10 | Publié : https://www.instagram.com/reel/DdkHZYSAalh/ |
| `qff-culture-1` | Culture générale, mélange QCM / questions ouvertes / images, effets zoom, pixellisation, flou, fond en dégradé | 2 min 31 | Publié : https://www.instagram.com/reel/DdnHGZgDBjw/ |
| `qff-eyes-1` | « Devine la star à ses yeux », 15 stars, zoom sur les yeux puis portrait complet | 2 min 17 | Publié : https://www.instagram.com/reel/DdnVJ1vE6nC/ |
| `qff-culture-2` | Culture générale texte seul (sans image), 7 QCM / 8 ouvertes, aucune question déjà posée | 2 min 34 | Publié le 23 sept : https://www.instagram.com/reel/DdoZwsWASMO/ (Facebook : 368) |
| `qff-flags-1` | 15 drapeaux sans effet, chrono 2 s, intro rapide, voix Kokoro, vraie musique | 1 min 46 | v1 supprimée par Adel (musique trop forte). v2 remixée publiée le 23 sept : https://www.instagram.com/reel/DdozfUlkvfh/ (Instagram seul) |

Aucune n'est passée sur Facebook (erreur 368 à chaque fois).

Les fichiers livrés (mp4, spec.json, sources des images) sont dans la conversation et, pour les premiers,
dans `C:\Users\mekka\Documents\03-Projets\Animatelier\projets-videos\<nom>\`.
**Non copiés sur son ordinateur faute de liaison active : `qff-culture-1` et `qff-eyes-1`.**

### 5.1 Retours d'Adel, à respecter

- Pas de questions qui donnent l'indice (« Which app… », « Which car brand… » sur un quiz de logos).
- Le minuteur doit démarrer **juste après** la fin de la voix, d'où `timing.read: "voice"`.
- Compte à rebours de **3 secondes**.
- Voix variée, pas robotique : alterner « Of course, it's Apple! », « Yes, it's X », « The answer is… »,
  aussi bien pour les questions que pour les réponses.
- Questions grand public, même au niveau GOAT.

---

## 6. Images

### 6.1 Wikimedia, ce qu'il faut savoir

- Seuls `commons.wikimedia.org` (API) et `upload.wikimedia.org` (fichiers) sont autorisés.
  `thumb.wikimedia.org`, que l'API renvoie dans `thumburl`, est **bloqué** : remplacer l'hôte par
  `upload.wikimedia.org`, le reste du chemin est identique.
- **Largeurs de vignette imposées** : 250, 500, 960, 1280 fonctionnent ; 320, 640, 800, 1000, 1024 renvoient
  une erreur 400 « Use thumbnail sizes listed on… ». Utiliser 960 ou 1280.
- **Limitation de débit très agressive** sur cette adresse IP : erreurs 429 « robot policy » en rafale,
  parfois plusieurs minutes d'attente par requête. Prévoir des relances espacées de 15 à 30 secondes,
  regrouper les requêtes `imageinfo` (jusqu'à 50 titres par appel), et lancer les recherches en arrière-plan.
  Une recherche par nom prend entre 1 et 5 minutes dans ces conditions.
- La recherche Commons est de mauvaise qualité pour les célébrités : beaucoup de statues de cire, de dessins
  de fans, de graffitis et de plans de concert lointains. Les bons portraits viennent presque tous de
  quelques photographes (Gage Skidmore, Harald Krichel, Raph_PH, Gabriel Hutchinson, PhilipRomano, Toglenn),
  qui publient **aussi sur Flickr**, d'où l'intérêt d'ouvrir ce domaine.
- Toujours relever la licence et l'auteur (`iiprop=extmetadata`, `iiextmetadatafilter=LicenseShortName|Artist`)
  et livrer un fichier `sources-*.md`. Les licences CC BY et CC BY-SA imposent de créditer l'auteur en légende.

### 6.2 Recadrage visage pour le quiz « yeux »

`scripts/crop_faces.py` (OpenCV, cascades de Haar) : détecte le visage, recadre un carré de `span` fois
la hauteur du visage, enregistre en 900x900 et renvoie le point focal des yeux (`focusX`, `focusY`)
à reporter dans la spec. `span = 1.75` donne, avec le zoom x3 de l'outil, une bande d'yeux propre.
Un `span` plus grand montre davantage du visage pendant le compte à rebours, un `span` plus petit montre moins.
La détection échoue sur les photos de profil, les visages sombres ou de loin : vérifier chaque recadrage
avec une planche contact avant de construire la spec.

### 6.3 Domaines à ouvrir

Voir `domaines-images-libres.md` dans ce dossier. Les quatre qui débloquent vraiment la situation :
Flickr (`api.flickr.com`, `live.staticflickr.com`, `www.flickr.com`), Openverse (`api.openverse.org`, `openverse.org`),
PICRYL (`picryl.com`, `cdn.picryl.com`, `thumbnails.picryl.com`) et Wikipédia (`en.wikipedia.org`, `fr.wikipedia.org`,
`api.wikimedia.org`). Adel a la liste complète (une vingtaine de sources, avec les hôtes de fichiers et les clés
gratuites nécessaires) et doit les ajouter dans la politique réseau de l'organisation.

---

## 7. À faire ensuite

1. **Planifications**. Adel les a toujours repoussées à « quand les tests seront finis ». Il a mentionné un tableur
   « Theme de quiz » dans son dossier Drive (`https://drive.google.com/drive/folders/1Fcv3CNm9mYm5NCSGpSOWPU9xwrk1wj-G`)
   comme source possible de thèmes. Utiliser les outils `create_trigger` du MCP claude-code-remote, jamais les crons locaux.
2. **Corriger le workflow n8n** pour que les étapes miniature et lien Facebook ne s'exécutent pas après un échec d'upload.
3. **Facebook** : retenter une seule fois par publication, et prévenir Adel si le blocage persiste au-delà de quelques jours.
4. **Équilibrer musique et cinéma** sur le prochain quiz « yeux » : la version publiée compte 10 acteurs pour
   5 chanteurs, faute de portraits de chanteurs exploitables sur Commons. Flickr devrait régler ça.
5. **Variante QCM du quiz « yeux »** : elle est rendue mais sans audio, Adel n'a pas tranché. La photo y est
   nettement plus petite.
6. **Demandes possibles à l'agent qui code Animatelier** : niveau de zoom réglable dans la spec,
   présentateur animé et indices disponibles en mode `levels`, mise en page QCM qui garde une grande image.

---

## 8. Où sont les fichiers

- **Livrés à Adel** (conversation, et pour certains son ordinateur) : les mp4, les `spec.json`, les fichiers de sources.
- **Dépôt Animatelier** : `projets-videos/<nom>/` pour les vidéos, `docs/QUIZ-VIDEO.md` et `docs/QUIZ.md` pour l'outil.
- **Projet claude.ai « animatelier »** : `qff-pipeline/` contient ce document, les scripts et les anciens exemples.
- **Scratchpad de la session** : tout le travail intermédiaire (photos, clips vocaux, rendus). Il disparaît avec
  la session, ne rien y laisser d'important.


---

## 9. Méthode actuelle (23 sept, commit 93fb6cf) : remplace les étapes 2 à 9 de la section 3

```sh
# 1. script vocal (ids + textes) sans rendu, depuis le dépôt animatelier
node voice_script.mjs spec.json voice-script.json
# 2. voix Kokoro (naturelle, Apache 2.0), modèle sur la release GitHub thewh1teagle/kokoro-onnx model-files-v1.0
QFF_KOKORO_DIR=kokoro/ python3 tts_kokoro.py voice-script.json clips/ af_heart 1.05
# 3. rendu + voix + musique + mixage + contrôle en une commande (2 cœurs : ~4 min pour 1 min 46)
node apps/cli/quiz-video.js spec.json --preset qff-preset.json --assets-dir img/ --voice-clips clips/ \
  --music joyeux.mp3 --loudness=-16 --sfx default --preview auto --jobs 2 --out out/
```

- `--loudness=-16` avec le signe égal, sinon refus de l'argument.
- Le true peak n'est pas tenu par l'outil (-0,1 dBFS mesuré). Correction : extraire l'audio,
  `aresample=192000,alimiter=limit=0.72:attack=1:release=50:level=disabled,aresample=48000`, puis `mux-audio.js --audio` (sans `--keep-sfx`).
  Résultat -15,8 LUFS, -1,5 dBTP. À signaler à l'agent qui code.
- Valider la mise en page vite : `--preview-only --preview 1.5,12 --frames 1.5` (quelques secondes). Avec `read: "voice"`,
  il faut les clips : faire une copie de la spec en `read: "auto"` pour la toute première mise en page.
- `qff-preset.json` (dans ce dossier) : thème QFF dégradé, intro rapide demandée par Adel (1 s de logo puis écran titre
  avec « Answer these fifteen questions, and find out if you're a rookie... or a goat! »), modèles de réponses variés, outro.
  La spec ne contient plus que `title`, `intro.title`, éventuellement `intro.elements` (redonner l'élément `cover_logo_big` si on en ajoute,
  les listes ne fusionnent pas), les niveaux et les exceptions de timing. `qff-logo.png` doit être dans `--assets-dir`.
- **Couverture** : l'écran titre (logo + intitulé du quiz + petite illustration, sauf culture G) est visible dès 1 s.
  Publier avec `-F cover_at=2`. Garder le contenu entre y=260 et y=1650 (grille Instagram en 3:4).
- **Mixage de l'outil trop fort en musique** : Adel a supprimé le Reel drapeaux du 23 sept (on n'entendait pas la voix).
  Ne plus utiliser `--music` de l'outil. Rendre avec `--voice-clips` mais sans `--music`, puis `mix_qff.py out clips musique.mp3 mix.wav -30`
  (voix -16 LUFS, musique -30 LUFS entre les phrases et baissée de 10 dB sous la voix), extraire les bruitages
  (mux d'un WAV silencieux sur la vidéo muette avec `--keep-sfx`), les ajouter à -8 dB, limiteur, puis `mux-audio.js --audio` sans `--keep-sfx`.
  Toujours envoyer la vidéo à Adel avant de publier.
- Musiques : `projets-videos/musiques-pixabay/` chez Adel (voir PROVENANCE.md, éviter celles avec Content ID).
- Drapeaux : `raw.githubusercontent.com/hampusborgos/country-flags/main/svg/<code>.svg` (domaine public), convertis avec resvg.
  L'API Commons a répondu 403 « robot policy » le 23 sept.
- Voix : Adel veut une **alternance entre 4 voix Kokoro** d'une vidéo à l'autre : am_michael (voix 1), am_fenrir (voix 4),
  af_heart (voix 8), af_bella (voix 9). qff-flags-1 a été faite avec af_heart. Prochaine : am_michael, puis am_fenrir, af_bella, af_heart...
- Google Sheet et dossiers photos Drive : mis de côté par Adel le 23 sept, à reprendre plus tard.

## 10. Registre et planning (Google Sheet « Theme de quiz »)

- Fichier `1_Add9gEoEBMdCiirfpEq6gjFg4S4Mh6kkDW6eck6rWc` dans le dossier Drive `1Fcv3CNm9mYm5NCSGpSOWPU9xwrk1wj-G`
  (propriétaire abedzoubir91@gmail.com). Onglet 1 : Sujet, Type de quiz, Fait ?, Date de diffusion, Repertoire photos.
  Onglet 2 : Question posée, Date, Quel Quiz.
- Le connecteur Google Drive lit ce fichier mais **ne peut pas modifier ses cellules**. Solution à mettre en place avec Adel.
- Règles d'Adel : mettre à jour le planning à chaque publication, consigner toutes les questions, créer un dossier Drive
  par quiz avec photos (et vérifier qu'on ne réutilise pas les mêmes photos).
- Planifications prévues (quand Adel donnera le feu vert) : 14 h quiz culture G, 19 h thème suivant du planning.
