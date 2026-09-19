# Quiz et révélations progressives

Accessible dans l’application avec **Quiz**, et dans **Agents → Guide quiz**.
Un agent commence par `window.animatelier.help()` : méthodes, guide, exemples
et schémas complets sont disponibles sans consulter le dépôt.

## Contrat

`compileQuiz(spec)` construit sans mutation un projet v2 validé et un calendrier
`schedule` en secondes globales. `loadQuiz(spec)` le charge avec un nouvel ID
et une seule entrée dans l’historique. Une erreur laisse le projet intact.

- `mode` : `choices` (QCM) ou `list` (liste cumulative).
- `title` : 1 à 80 caractères.
- `revealDelay` : 0,5 à 30 secondes, **3 par défaut**.
- `answerDuration` : 0,5 à 30 secondes, **2 par défaut**, après révélation.
- `listSize` : 1 à 10, **10 par défaut** ; doit couvrir les questions en mode liste.
- `questions` : 1 à 30 en QCM, au plus `listSize` en liste.
  Chaque entrée contient `question` (1–180 caractères). En liste, `answer`
  est requis (1–80 caractères). En QCM, `choices` contient 2–4 textes distincts
  (1–80 caractères) et `correctIndex` indique le bon choix, **à partir de zéro**.
  Les champs de l’autre mode sont rejetés pour éviter les ambiguïtés.
- `theme` facultatif : `background`, `panel`, `text`, `accent`, `correct`,
  couleurs hexadécimales `#RRGGBB`. Choisir des couleurs contrastées.

Une scène par question, de durée `revealDelay + answerDuration`. À l’instant
exact de révélation, la réponse apparaît. À la frontière de scène, la question
suivante s’affiche. Les réponses précédentes restent dans leur case en mode
liste ; les cases suivantes restent vides. Après la dernière réponse, la liste
reste visible pendant `answerDuration`. Les choix QCM sont visibles immédiatement,
mais seul le bon choix reçoit un indicateur « Bonne réponse » après le délai.
Les cartes apparaissent avec un court fondu et une barre matérialise le délai.

## Exemple navigateur

```js
const api = window.animatelier;
const spec = {
  title: "Les capitales", mode: "list", listSize: 10,
  revealDelay: 3, answerDuration: 2,
  questions: [
    { question: "Capitale de la France ?", answer: "Paris" },
    { question: "Capitale de l’Italie ?", answer: "Rome" }
  ]
};
const built = api.compileQuiz(spec); // project, duration, schedule, warnings
api.validate(built.project);
api.loadQuiz(spec); // nouvel ID ; annuler dans l’éditeur si nécessaire
api.getStateAt(2.99); // list_answer_1 invisible
api.getStateAt(3); // list_answer_1 visible
api.getStateAt(5); // question 2, Paris reste affiché
api.seek(8); // Rome apparaît
api.save();
const video = await api.exportVideo();
// video.url : URL blob locale ; récupérer avant releaseExport(video.url)
// api.getExportState() pour la progression ; api.cancelExport() pour annuler
```

Pour un QCM, remplacer le mode par `choices` et les questions par :

```json
[{"question":"Combien font 6 × 7 ?","choices":["36","42","48","54"],"correctIndex":1}]
```

`api.help().quiz.examples` fournit les deux exemples, dont une liste complète
de dix questions. `api.schema().quiz` donne le JSON Schema ; les contraintes
entre champs sont contrôlées à la compilation avec les erreurs Zod détaillées.

## Édition et vérification

Le résultat est constitué de rect/text/group et de clés numériques ordinaires.
Aucun type métier quiz n’est ajouté au format v2. Les textes sont coupés en lignes
et leur taille adaptée ; les très longs mots sont coupés. Inspecter le PNG pour
la typographie, en particulier les emoji et écritures utilisant des polices de repli.
Les IDs sont stables dans chaque scène : `question`, `choice_1`,
`correct_1`, `list_slot_1`, `list_answer_1`, etc.
Les numéros visibles et IDs commencent à 1 ; seul `correctIndex` commence à 0.

`getStateAt(t)` renvoie aussi les éléments cachés. Pour savoir ce qui apparaît,
vérifier `visible` et `effectiveOpacity > 0`, puis les enfants des groupes.
La visibilité avant/après chaque `schedule[i].reveal` se teste sans capture.
Le JSON contient toutes les réponses : cette fonction crée une vidéo, pas un jeu
avec réponses secrètes, boutons interactifs ou calcul de score.

Modifier les éléments et clés dans le panneau Éléments ou avec `apply`.
Les scènes sont des copies indépendantes : une retouche manuelle sur une réponse
déjà révélée ne se propage pas aux scènes suivantes. Régénérer depuis le script
pour une modification globale (cela remplace les retouches du projet généré).
Sauvegarder aussi le JSON du projet avec le bouton de l’application.

## MCP

`capabilities` expose le même guide, les exemples et schémas.
Appeler `quiz_compile` avec `{spec}` : opération sans mutation ni révision.
Lire `project_get`, puis appeler `project_load_data` avec le projet retourné
et `expectedRevision`. Vérifier `project_state_at`, `render_frame` et sauvegarder
avec `project_save`. Importer le JSON dans l’éditeur pour exporter la vidéo.
Le MCP possède sa propre session : aucun pont live ni export vidéo MCP.

## Export et limites

Vidéo WebM silencieuse, 1280 × 720, export en temps réel avec onglet visible.
Pas de voix automatique, musique, MP4 ou cadence garantie. L’URL blob est locale
à la page, pas un lien de partage ; ne la libérer qu’après récupération.
Les textes et couleurs sont fournis par l’auteur ; aucun contenu généré par IA,
service payant, logo ou habillage d’émission n’est requis.
