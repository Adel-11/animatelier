# Pistes, mains et oscillations

Ces ajouts sont compatibles avec les projets v2 précédents : `timeline` vaut
`[]`, `wobble` vaut `{}`, et `attachment` est absent par défaut.
L’aide est disponible dans Agents et `window.animatelier.help().motion` ;
le MCP expose les mêmes informations dans `capabilities.schema.motion`.

## Plusieurs actions pour un personnage

Dans les propriétés du personnage, ouvrir **Piste d’actions**, modifier le JSON
puis appliquer. Les segments apparaissent sur une seule ligne de timeline.
Exemple pour un personnage présent de 0 à 8 secondes :

```json
[
  {"start":0,"end":2,"action":"walk","toX":620},
  {"start":2,"end":4,"action":"hold","dialogue":"Voici mon objet."},
  {"start":4,"end":6,"action":"point","dialogue":"Regardez ici."},
  {"start":6,"end":8,"action":"walk","toX":900}
]
```

`timeline` contient au plus 100 segments, triés, sans chevauchement, de durée
positive et compris dans `[actor.start, actor.end]`. Le temps est en secondes
de scène. Les intervalles sont `[start,end[` ; à la fin exacte de présence,
le dernier segment qui se termine là reste évalué. Dans les trous, les champs
de base `action` et `dialogue` s’appliquent. Chaque segment démarre sa propre
phase d’animation. Il n’y a pas encore de fondu entre poses.

Actions : `idle`, `wave`, `walk`, `talk`, `celebrate`, **`hold`** (bras en avant),
**`point`** (main droite tendue avec doigt). Le dialogue d’un segment est vide
par défaut ; une réplique anime la bouche même en pose hold/point.
Les dialogues indépendants, le profil de marche et le casting partagé restent
des évolutions futures.

`toX` facultatif est une destination absolue en pixels, de -10000 à 10000.
La première marche part du `x` de base ; la suivante part de la dernière
destination. Mouvement linéaire pendant le segment, position conservée dans
les trous. Dès qu’un `toX` existe, `moveX` est ignoré sur toute la piste.
Une piste numérique `keyframes.x` a priorité sur tous les `toX` et `moveX`.
`toX` n’impose pas l’action walk : il peut aussi déplacer une autre pose.
Le retournement reste explicite avec `flip` ; le pas ne s’adapte pas encore à
la vitesse. Le glisser-déposer est désactivé lorsque la position est animée.

## Objets dans les mains

Un élément **racine** peut porter :

```json
{"attachment":{"actorId":"alex","hand":"right"},"x":0,"y":0}
```

Dans Éléments, choisir le personnage et la main, puis ajuster x/y et la rotation.
L’origine devient le centre de la main ; x/y sont des décalages locaux, en pixels.
La transformation suit le corps, son pivot, le rebond, l’échelle, `flip`, puis
la rotation du bras. La visibilité et l’opacité sont héritées du personnage.
Le z de l’élément s’ajoute au z du personnage ; les enfants d’un groupe gardent
leurs couches locales. Les côtés left/right désignent le rig avant retournement.
Un objet est dessiné comme une couche entière, sans occlusion automatique par
les doigts. Détacher conserve les valeurs locales : repositionner ensuite x/y
dans la scène, la position visuelle n’est pas automatiquement préservée.

On peut attacher un groupe et disposer plusieurs éléments dedans. Les enfants
ne peuvent pas avoir leur propre attache. Référence à un personnage absent ou
suppression d’un personnage encore référencé : erreur, aucune mutation.
Supprimer/détacher les objets et supprimer le personnage dans le même `apply`
est autorisé ; le lot est validé après toutes ses commandes.

## Oscillations génériques

Personnages et éléments proposent **Oscillations**, sous forme de JSON :

```json
{"rotation":{"amplitude":4,"frequency":1,"phase":0}}
```

Pour chaque propriété numérique animable, le résultat est la valeur de base
ou interpolée plus `amplitude * sin(2π * frequency * temps + phase * π/180)`.
Amplitude de 0 à 10000 dans l’unité de la propriété (degrés pour rotation),
fréquence de 0 à 20 Hz, phase de -360 à 360 degrés (0 par défaut).
Temps de scène, jamais nombre d’images : lecture et export sont déterministes.
Le résultat est borné aux limites de la propriété (par exemple opacity 0–1).
L’oscillation se superpose aux clés et peut donc s’aplatir aux bornes.
Pour la position avec `toX`, l’oscillation x s’ajoute à la trajectoire.
Les paramètres de l’oscillation sont constants ; pas de bruit aléatoire.

## Parcours agent

```js
const api = window.animatelier;
const p = api.getProject();
const scene = p.scenes[0];
const actor = scene.actors[0];
// Adapter les temps à la présence de ce personnage.
actor.timeline = [{start:actor.start,end:actor.end,action:"hold",dialogue:"Bonjour !"}];
actor.wobble = {rotation:{amplitude:3,frequency:1,phase:0}};
api.apply([{type:"actor.replace",sceneId:scene.id,actor}]);
api.getStateAt(2); // action/dialogue évalués, matrices hands.left/right
// elements : worldTransform, visible, effectiveOpacity, enfants calculés
api.seek(2);
await api.renderPng(2);
api.save();
```

Consulter `api.schema()` pour tous les champs et bornes, `api.validate(p)` pour
un contrôle sans mutation. Le MCP utilise `project_apply` avec `expectedRevision`,
`project_state_at` et `render_frame`. Même moteur, sessions distinctes.
L’export WebM existant reste silencieux et exige un onglet visible.
