# Format v2 — lot 1

Décision du 19 septembre 2026 : l’utilisateur autorise l’abandon des projets v1. Aucune migration n’est prévue ; les imports v1 sont rejetés explicitement. Les nouvelles sauvegardes emploient une clé locale v2. Leurs anciennes données ne sont pas supprimées automatiquement.

## Contrat

- `schemaVersion: 2`, résolution 1280 × 720, 30 images/s. Les scènes possèdent `actors` et `elements` (tableau vide par défaut).
- Éléments : `rect`, `ellipse`, `line`, `text`, `group`. Identifiants uniques parmi personnages et éléments d’une scène, y compris les enfants des groupes.
- Commun : id, x/y (coordonnées locales, pixels), rotation (degrés), scale, opacity, z, start/end (secondes de scène), anchor `{x,y}` (pivot en pixels locaux), keyframes. Les formes partent de leur coin supérieur gauche ; les lignes vont de (0,0) à (x2,y2) ; le texte est posé sur sa ligne de base. Transformation : translation x/y, translation au pivot, rotation, échelle, translation inverse du pivot.
- Les enfants sont relatifs au groupe pour la géométrie, mais utilisent le même temps de scène. La visibilité et l’opacité du groupe affectent ses enfants. Un groupe est une couche indivisible : le z d’un enfant reste local. À z égal, ordre du tableau conservé ; les personnages sont ordonnés selon y puis placés avant les éléments.
- `keyframes` associe chaque propriété numérique animable à un tableau de `{t,v,ease?}` trié strictement par t. Ease sur la clé d’arrivée : linear (défaut), easeIn (quadratique), easeOut, easeInOut, step. Avant/après la piste : première/dernière valeur. Une clé unique donne une constante. Les temps sont relatifs à la scène ; pas au début d’un élément.
- Animables : x, y, rotation, scale, opacity, z ; w/h et radius pour rect ; w/h pour ellipse ; x2/y2/strokeWidth pour line ; fontSize pour text ; strokeWidth pour rect/ellipse. Personnages : x, y, rotation, scale, opacity, z, moveX. Identifiants, dates de présence et pivot ne sont pas des pistes. Les bornes des valeurs des clés sont celles des propriétés.
- `moveX` reste accepté pour les personnages ; une piste x a priorité sur ce déplacement. La rotation du personnage pivote aux pieds par défaut ; sa bulle suit la position mais reste droite.
- Fin de présence inclusive dans ce lot. Plafonds : 200 éléments par scène (enfants compris), huit niveaux de groupes, 120 clés par piste, 120 s par scène. Aucun HTML/SVG brut, aucune ressource externe.
- Commandes `element.add` (parentId optionnel pour un groupe), `element.replace`, `element.remove`. Tout lot est validé atomiquement. Supprimer un groupe supprime ses enfants.

## Acceptation du lot

Construire par load/apply un rectangle avec pivot au coin, animé de 0 à -70° avec easing ; vérifier les instants intermédiaires, la composition des groupes, les erreurs de pistes et les limites. Même rendu dans l’aperçu, SVG, PNG et MCP. Éditeur : ajout des cinq types, sélection, modification, édition des images clés et suppression via commandes ; annuler/rétablir et sauvegarder/recharger.

Les lots suivants (path/draw, clip, compteur, timeline, attache main, caméra, freeze, transitions, images et export hors temps réel) ne font pas partie de ce contrat.


## Lot 2 — extensions compatibles v2

- `path` : d, fill (none par défaut), stroke, strokeWidth, draw (1 par défaut). draw et strokeWidth sont animables. Commandes M/L/H/V/C/S/Q/T/A/Z, absolues ou relatives, avec paramètres numériques séparés (notamment les indicateurs d’arc). Maximum 16 000 caractères, 500 segments, paramètres dans ±10 000. Les données sont normalisées ; aucun balisage, attribut ou URL n’est admis.
- draw révèle le contour selon sa longueur cumulée, y compris entre sous-tracés. À 0, rien ; à 1, contour et remplissage complets. Le remplissage apparaît uniquement à 1. Pendant le dessin partiel, chaque segment est rendu séparément : les raccords peuvent différer légèrement de ceux du contour final. Les longueurs sont calculées sans DOM ; courbes et arcs ont une précision numérique approchée.
- `group.clip` optionnel : `{type:"rect",x:0,y:0,w:200,h:200,radius:0}`, `{type:"ellipse",x:0,y:0,w:200,h:200}` ou `{type:"path",d:"M0 0 L200 0 L100 100 Z"}`. Géométrie statique en coordonnées locales du groupe, transmise à tous ses enfants. Animer le groupe déplace aussi son masque. Les masques imbriqués se cumulent.
- `text.number` optionnel : `{from:0,to:200,decimals:0}` ; `progress` (0 par défaut), animable entre 0 et 1. Chaque `{n}` du texte est remplacé par la valeur interpolée. 0 à 6 décimales, point décimal déterministe, bornes ±10^12. Aucune expression ni évaluation de code.
- getStateAt expose displayText/numberValue pour le texte et pathLength/drawnLength pour les tracés. La visibilité est temporelle ; elle n’est pas un test pixel par pixel du masque.

Exemple complet : `examples/trace-masque-compteur.animatelier.json`. Les fichiers v2 du lot 1 restent lisibles grâce aux valeurs par défaut des nouveaux champs.

## Extensions compatibles : actions, attaches et oscillations

Voir [PERSONNAGES.md](PERSONNAGES.md) pour les contrats de timeline, toX, attachment et wobble. Les valeurs par défaut préservent les projets précédents. Les actions hold/point sont ajoutées ; les clés x restent prioritaires sur le déplacement. Les références d’attache sont validées à la fin d’un lot atomique. Les nouvelles données ne seront pas comprises par les anciennes versions de l’application.
