# Pipeline QFF (Quiz Factory Forever)

Fabrication d'un quiz vidéo 9:16 à 3 niveaux, entièrement dans le cloud, puis publication via n8n.

## Fabrication

1. `git clone https://github.com/Adel-11/animatelier.git && cd animatelier && npm ci`
2. Écrire `spec.json` (15 questions, 3 niveaux de 5) et `speech.json` (textes lus). Questions grand public, même au niveau GOAT.
3. `node gen_lv.js spec.json out/project.json` : projet Animatelier 1080x1920 + `project.marks.json` (minutage exact).
   Durée visée : moins de 3 min (Reel Instagram).
4. `node apps/cli/render.js out/project.json --out out/video_silent.mp4 --jobs 4` (environ 9 min pour 3 min de vidéo).
5. Voix : modèle Coqui `tts_models--en--ljspeech--vits` (GitHub coqui-ai/TTS, release v0.8.0_models), `espeak-ng` requis.
   `python3 tts_lv.py out` puis `python3 audio_lv.py out` (musique, bruitages, voix).
6. Mixage (sidechain, voix -16 LUFS) puis incrustation du logo avec ffmpeg :
   logo 860 px centré de 0 à 3 s (couverture), logo 190 px en haut à gauche (x 50, y 165) ensuite.

## Couleurs (logo)

Fond #07275F, panneaux #0F3678, texte #FDF8E3, jaune #FECD1B.
Niveaux : ROOKIE #3DDC97, MASTER #FF8A3D, GOAT #FF4D6D.

## Publication (n8n)

Workflow « QFF - Publier Reel » (id m2aUOyCJcd0xNJY5), webhook POST `/webhook/qff-publish?key=...`.
Corps : fichier multipart `video` ou `video_url`, `caption`, `dry_run` (true = rien de public), `facebook` (false pour ignorer FB).
Instagram : upload binaire resumable (rupload), couverture = image extraite à 1 s (le logo). Compte IG 17841432634177522.
Facebook : vidéo de Page (les Reels FB via API sont limités à 90 s), Page 1348258481705058, miniature = même image.
Credential n8n : « Quiz Factory Forever Token ».

## Bloquant connu

Le cloud Claude ne peut pas joindre n8n.letter-bird.com (politique réseau). Il faut autoriser ce domaine
dans les réglages réseau de l'organisation, sinon la vidéo ne peut pas être envoyée automatiquement à n8n.
