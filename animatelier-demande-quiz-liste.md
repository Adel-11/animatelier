# Demande pour Animatelier : mode `stack` (quiz liste)

Contexte : les quiz liste QFF (mode `stack`, preset `qff-stack`, 9:16) sont fabriqués par `tools/qff/qff.py`. Plusieurs manques obligent aujourd'hui à contourner l'outil avec des `elements` par item. Merci de traiter les points ci-dessous, avec un exemple dans `examples/` et une mise à jour de `docs/QUIZ-VIDEO.md`.

## 1. Bug : `backgroundImage` n'apparaît pas au rendu
- Spec : `items[i].backgroundImage: "file:stadium.jpg"`.
- Dans `project.json`, l'élément `background_image` (flou 22) est bien présent, avec un asset valide.
- Rendu headless (`--frames`, vidéo) : le fond reste uni. Même en masquant `background_dim` (`layout: {"background_dim": {"visible": false}}`), rien ne s'affiche.
- Une image normale (`items[i].image`) s'affiche, elle. Le problème vient probablement du `blur` sur une image dans le moteur de rendu.

## 2. Fond animé natif
Il faut un fond photo flou, qui change à chaque item et zoome, puis dézoome d'un item à l'autre (effet Ken Burns), présent aussi sur la carte finale.

Proposition :
```json
"background": {
  "images": ["file:a.jpg", "file:b.jpg"],
  "blur": 16, "dim": 0.5,
  "motion": "pingpong", "zoom": 1.12
}
```
- `images` : les photos tournent d'un item à l'autre.
- `motion` : `in`, `out` ou `pingpong`.
- La scène de fin (`outro`) doit avoir le même fond.

## 3. Questions longues dans la carte
- `txt("question")` calcule le retour à la ligne sur la boîte d'origine (764 × 67). Or un override `layout` de `fontSize`, `y` ou `h` est appliqué après ce calcul, ce qui fait déborder le texte.
- Une question de 8 à 12 mots (« Which club has won the most Champions League titles? ») sort donc minuscule ou coupée.
- Demandé :
  - une zone question multi-ligne qui occupe la carte (jusqu'à 3 lignes centrées vers 56 px quand il n'y a pas d'image) ;
  - que le retour à la ligne tienne compte des overrides `layout` (w, h, fontSize).

## 4. Temps de réflexion pour les questions texte
- Pour un item sans `audio`, `timing.listen` est ignoré. Le seul temps de réflexion est `countdown`.
- Demandé : un `timing.think` (et `items[i].think`) pour les items sans audio, distinct de la durée du compte à rebours affiché.

## 5. Scène insérée (like & follow) comme en mode `levels`
- En `levels`, on insère une scène `sequence` après la question 3 (cœur + « LIKE & FOLLOW »).
- En `stack`, c'est impossible aujourd'hui. On contourne avec des éléments sur l'item 4 pendant ses 2,5 premières secondes.
- Demandé : `sequence: [{ after: "question_3", id, duration, elements, say }]` en mode `stack`, la liste restant affichée derrière ou non (option).

## 6. Validation des keyframes selon les durées réelles
- Des keyframes d'un élément d'item placées après ~5,5 s sont refusées (« piste … au-delà de la durée de scène »), même quand la scène dure 10 s avec les voix (`--voice-clips`). La validation semble faite sur les durées sans voix.
- Demandé :
  - valider avec les durées finales ;
  - ou permettre des temps relatifs aux phases (`"t": "reveal+1.2"`, `"t": "end-2"`).

## Critères de fin
- `examples/quiz-stack-bg.spec.json` avec 4 fonds animés, 10 questions longues, un `sequence` like & follow après la question 3 et un fond sur l'outro.
- Le rendu `--frames` et la vidéo montrent le fond flou et le zoom.
- Aucune régression sur `examples/quiz-stack.spec.json`.
