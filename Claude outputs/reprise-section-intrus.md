# Point de reprise, 13 octobre 2026 — trouve l'intrus et emojis

Nouveau mode `odd` (`packages/core/odd.ts`), branché dans `compileQuiz`, `quizSchema` et la CLI (`--voice-clips` et `--voice-durations`).
- Les choix sont disposés en cercle autour d'un minuteur natif.
- À la révélation, les autres choix disparaissent et l'intrus vient au centre en rouge. Le libellé et l'explication s'affichent.
- Le fond, le bandeau, le logo, `sequence` et la fin sont les mêmes que pour `stack`.

Emojis en couleur : `packages/core/emoji.ts` détecte les textes faits uniquement d'emojis et les remplace par des images Noto Emoji `file:emoji/…`. `packages/headless/assets.ts` télécharge à la demande les images absentes (source figée, Apache 2.0). `stack` les utilise pour la question et accepte maintenant 3 items minimum.

`tools/qff/qff.py` gère le mode `odd` (valeurs QFF par défaut, CTA, voix) et génère son script de voix par `compileQuiz`.

Vérifications :
- `tests/odd.test.ts` (4 tests) ; `npm test` 83/84, l'échec est le délai de 5 s de `tests/motion.test.ts` sous charge parallèle (le fichier seul passe, avant et après la modification) ;
- `npm run build` réussi ;
- deux vidéos QFF complètes générées (intrus et emojis), images extraites du MP4 inspectées.

Non vérifié : parcours navigateur (e2e), MCP SDK client, déploiement Netlify.

---
