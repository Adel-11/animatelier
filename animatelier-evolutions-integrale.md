# Animatelier : évolutions demandées pour les animations pédagogiques (intégrale)

Retour d'usage de l'API `window.animatelier` (apiVersion 2, schemaVersion 1), après avoir produit une animation de 39 s avec 5 scènes et 4 personnages uniquement par script.

## 1. Objectif à atteindre

Pouvoir produire entièrement par l'API (sans clic dans l'interface) ces deux animations :

**Animation A, débit constant**
- Un verre s'incline et verse de l'eau dans un récipient gradué (en mL).
- Le filet d'eau garde toujours la même épaisseur. Le niveau monte régulièrement.
- À l'écran : un chrono `t`, le débit `Q = 20 mL/s` et le volume `V` qui s'incrémente.
- En fin de scène, la formule `V = Q × t = 20 × 10 = 200 mL` apparaît, et le niveau lu sur la graduation correspond.
- Un graphe Q(t) (droite horizontale) se trace en même temps. L'aire sous la courbe (un rectangle) se remplit au fur et à mesure.

**Animation B, débit variable**
- Un personnage tient le verre et verse de façon irrégulière (à-coups, pauses, filet qui change d'épaisseur).
- Le graphe Q(t) devient une courbe irrégulière. Le texte « Q × t ? Impossible, Q change tout le temps » apparaît.
- Ensuite viennent 5 ou 6 arrêts sur image (façon stop motion). À chaque arrêt : l'image se fige, on isole un petit intervalle Δt, on affiche le débit à peu près constant Qᵢ sur cet intervalle et le volume Qᵢ × Δt, un rectangle s'ajoute sous la courbe, et la somme partielle se met à jour.
- À la fin, les rectangles s'affinent (N = 6, puis 12, puis 50) et on passe à `V = ∫ Q(t) dt`, avec l'aire sous la courbe égale au niveau lu dans le récipient.

## 2. Limites actuelles qui bloquent

1. **Rien d'autre que des personnages.** Aucun objet (verre, récipient, flèche, texte libre, forme). Pour le cadeau de l'animation précédente, j'ai dû passer uniquement par les bulles de dialogue.
2. **Une seule action par entrée de personnage**, et un seul mouvement : `moveX` linéaire. Pas de `y`, pas de rotation, pas d'easing, pas d'images clés. Pour enchaîner « marcher, puis parler, puis saluer », il faut dupliquer le personnage en plusieurs entrées avec des ID différents et des plages de temps consécutives. Ça marche, mais c'est fragile et l'interface affiche une ligne de timeline par segment.
3. **Aucune valeur animée ni liée à une autre** (niveau d'eau, compteur, débit).
4. **Pas de graphe ni de formule.**
5. **Seulement 4 décors** (studio, office, park, night), sans décor neutre de type tableau ou fond uni.
6. **Bulles de dialogue qui se chevauchent** quand les personnages sont proches, sans moyen de les décaler.
7. **Export vidéo en temps réel** qui échoue si l'onglet passe en arrière-plan une seconde (« Export interrompu : gardez cet onglet visible ») : ça m'est arrivé à 73 %. Le résultat n'est qu'une URL `blob:` locale, sans moyen simple de télécharger le fichier par l'API.
8. **Sauvegarde uniquement dans le localStorage** de l'onglet : un projet créé dans un navigateur n'existe pas ailleurs.

## 3. Évolutions demandées (par priorité)

### P1. Objets de scène (`props`)

Ajouter un tableau `props` par scène, à côté de `actors`. Types minimum :

| type | usage | propriétés spécifiques |
|---|---|---|
| `glass` | verre qui verse | `fill` (0 à 1), `liquidColor` |
| `beaker` | récipient gradué | `capacity` (mL), `graduationStep`, `unit`, `level` (mL) |
| `stream` | filet d'eau | `from` (id d'objet), `to` (id d'objet), `flow` (épaisseur liée au débit) |
| `text` | texte libre, formule | `text`, `fontSize`, `align`, `math: true` pour du LaTeX simple |
| `arrow`, `rect`, `line` | annotations | `x2`, `y2`, `color`, `dashed` |
| `chart` | graphe (voir P3) | |
| `image` | image SVG ou PNG en data URL | `src` |

Propriétés communes : `id`, `x`, `y`, `scale`, `rotation`, `opacity`, `z`, `start`, `end`, plus `anchor` (pivot de rotation, indispensable pour incliner le verre autour de son bord).

### P2. Images clés sur toutes les propriétés numériques

Remplacer ou compléter `moveX` par un système générique :

```json
"keyframes": {
  "rotation": [{"t": 0, "v": 0}, {"t": 1.5, "v": -70, "ease": "easeInOut"}],
  "x":        [{"t": 0, "v": 300}, {"t": 2, "v": 420}]
}
```

- Valable pour les personnages et les objets, sur `x`, `y`, `rotation`, `scale`, `opacity`, `fill`, `level`, `flow`.
- Easing : `linear`, `easeIn`, `easeOut`, `easeInOut`, `step`.
- Option `jitter: {amplitude, frequency, seed}` sur une piste, pour le versement imprécis (reproductible grâce à la graine).

Côté personnages : une **timeline d'actions par personnage** au lieu de dupliquer les entrées :

```json
"timeline": [
  {"start": 0, "end": 3, "action": "walk"},
  {"start": 3, "end": 6, "action": "talk", "dialogue": "..."}
]
```

Ajouter aussi une action `hold` (tenir un objet) et un rattachement `attachTo: {actor: "papa", hand: "right"}`. L'objet suit alors la main, et le bras suit la rotation du verre.

### P3. Grandeurs liées et calcul (le cœur du besoin)

Déclarer des **variables** au niveau de la scène, dérivées les unes des autres :

```json
"variables": {
  "Q": {"type": "series", "unit": "mL/s", "points": [[0,0],[0.5,20],[10,20],[10.5,0]]},
  "V": {"type": "integral", "of": "Q", "unit": "mL"}
}
```

- `series` : valeurs échantillonnées, interpolées linéairement ou en escalier.
- `integral` : calcul numérique par le moteur (trapèzes, pas de 1/fps).
- Les propriétés peuvent se lier à une variable : `"level": "=V"`, `"flow": "=Q"`. Le niveau du récipient est donc toujours cohérent avec le débit, sans calcul à la main.
- Texte avec interpolation : `"Volume : {V:0} mL"`, `"Débit : {Q:1} mL/s"`, `"t = {t:1} s"`.

Objet `chart` :

```json
{"type": "chart", "id": "g1", "x": 700, "y": 150, "w": 500, "h": 300,
 "xAxis": {"var": "t", "min": 0, "max": 12, "label": "t (s)"},
 "yAxis": {"min": 0, "max": 40, "label": "Q (mL/s)"},
 "series": [{"var": "Q", "draw": "progressive"}],
 "area": {"var": "Q", "from": 0, "to": "=t", "fill": "#4a90e2", "opacity": 0.3},
 "riemann": {"var": "Q", "from": 0, "to": 10, "n": 6, "mode": "left", "reveal": "progressive", "highlight": 3}}
```

- `draw: "progressive"` : la courbe se trace au rythme du temps.
- `area` : l'aire sous la courbe se remplit jusqu'à `t`.
- `riemann` : rectangles, avec `n` animable par images clés (6, puis 12, puis 50), `highlight` pour mettre un rectangle en évidence, et étiquettes optionnelles Δt, Qᵢ, Qᵢ × Δt.
- Une variable `sum` qui vaut la somme partielle des rectangles déjà révélés, affichable dans un texte.

### P4. Arrêt sur image et stop motion

- Type de scène `freeze` : `{"type": "freeze", "source": "sceneId", "at": 4.2, "duration": 3}`. L'état exact de la scène source à cet instant est figé, et on peut y superposer ses propres `props` (encadrés, flèches, textes).
- Effets de transition entre scènes : `cut`, `fade`, `flash` (le petit flash blanc typique d'un stop motion), `zoom` sur une zone (`{x, y, w, h}`).
- Alternative plus simple si c'est trop lourd : un `timeScale` par piste (0 = gelé), pour figer le liquide et le personnage pendant que les annotations continuent de s'animer.

### P5. Décors et mise en page

- Décors : `plain` avec `backgroundColor`, `blackboard`, `whiteboard`, `kitchen`, `lab`.
- Bulles : `bubbleOffset: {x, y}` ou `bubbleSide: "left" | "right" | "top"`, et un évitement automatique des chevauchements.
- Grille de repérage optionnelle dans l'éditeur (affichage seul, sans export).

### P6. Export et fiabilité (pour le travail par agent)

- **Export image par image** plutôt qu'en temps réel : `renderPng(t)` existe déjà et le rendu est déterministe, donc on peut encoder avec WebCodecs (ou `ffmpeg.wasm`) sans dépendre de la visibilité de l'onglet. À défaut, reprendre l'export là où il s'est arrêté au lieu de tout perdre.
- `exportVideo({download: true, filename: "integrale.webm"})` pour déclencher le téléchargement directement.
- Formats : WebM, et MP4 (H.264) si le navigateur le permet, plus un GIF court optionnel.
- `exportJson()` et `importJson(texte)` pour sortir le projet du localStorage.
- `renderSvg` et `renderPng` doivent aussi dessiner les nouveaux objets et graphes, pour que l'agent puisse vérifier une image sans passer par une capture d'écran. Constat : après un `seek()`, l'aperçu à l'écran met parfois une seconde à se rafraîchir.
- `validate()` doit renvoyer des erreurs sur les liaisons (`"=V"` vers une variable inexistante, `integral` sans source, `attachTo` vers un personnage absent…).
- Mettre à jour `help()` et `schema()` avec des exemples complets pour chaque nouveau type.

## 4. Découpage suggéré (livrables testables)

1. **Lot 1** : `props` (glass, beaker, text, arrow, rect) + images clés génériques + `anchor` et rotation. Test : un verre s'incline de 0 à -70° autour de son bord.
2. **Lot 2** : `variables` (series, integral) + liaisons `"=V"` + interpolation dans les textes + objet `stream`. Test : animation A complète, niveau final = 200 mL.
3. **Lot 3** : objet `chart` avec tracé progressif, aire et rectangles de Riemann animables. Test : N passe de 6 à 50, et l'aire affichée converge vers V.
4. **Lot 4** : timeline par personnage, action `hold` et `attachTo`, `jitter`. Test : animation B avec versement irrégulier.
5. **Lot 5** : scènes `freeze`, transitions `flash` et `zoom`. Test : 6 arrêts sur image enchaînés.
6. **Lot 6** : export image par image, téléchargement direct, `exportJson` et `importJson`.

## 5. Critères d'acceptation

- Les deux animations décrites en section 1 se construisent uniquement par `apply()` ou `load()`, sans intervention dans l'interface.
- Le niveau affiché dans le récipient et la valeur de V calculée par le moteur sont identiques à tout instant (écart inférieur à 0,5 mL).
- L'export d'une animation de 60 s réussit même si l'onglet passe en arrière-plan.
- Les projets existants en schemaVersion 1 se chargent encore (migration automatique vers la version 2).
