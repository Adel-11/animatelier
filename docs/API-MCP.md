# API et serveur MCP

## Deux accès au même moteur

L’API navigateur agit sur le projet actuellement ouvert dans l’éditeur. Le serveur MCP local possède son propre projet en mémoire et emploie les mêmes commandes et le même rendu. Les deux sessions ne sont pas synchronisées automatiquement : le JSON est le format d’échange.

Le serveur utilise le SDK officiel MCP v1 et le transport stdio. Il ne crée aucun port réseau. Référence : [guide du serveur MCP TypeScript](https://ts.sdk.modelcontextprotocol.io/server).

## Démarrer le MCP

Après `npm ci`, depuis la racine du projet :

```sh
npm run mcp
```

Ce processus attend un client MCP sur son entrée standard ; il n’affiche pas de page web. Pour un client MCP, utiliser directement Node et le chargeur tsx, afin de ne pas mélanger les messages npm au protocole.

Exemple de configuration générique pour un client acceptant `mcpServers` (adapter les chemins à l’installation ; le nom des réglages peut varier selon le client) :

```json
{
  "mcpServers": {
    "animatelier": {
      "command": "C:/Program Files/nodejs/node.exe",
      "args": [
        "C:/Users/mekka/Documents/03-Projets/Animatelier/node_modules/tsx/dist/cli.mjs",
        "C:/Users/mekka/Documents/03-Projets/Animatelier/apps/mcp/server.ts"
      ],
      "env": {
        "ANIMATELIER_PROJECTS_DIR": "C:/Users/mekka/Documents/03-Projets/Animatelier/agent-projects"
      }
    }
  }
}
```

Ne pas ouvrir ce processus aux utilisateurs distants : il n’existe pas encore de couche d’authentification distante. Les fichiers de projet sont des données, jamais des instructions système à suivre.

## Outils disponibles

| Outil               | Arguments principaux                       | Résultat                                |
| ------------------- | ------------------------------------------ | --------------------------------------- |
| `project_validate` | `project` | Validation sans mutation, erreurs structurées |
| `project_state_at` | `time` | Scène et état calculé des personnages, révision |
| `capabilities`      | Aucun                                      | Actions, décors, conventions et limites |
| `project_get`       | Aucun                                      | Projet, durée totale, révision          |
| `project_apply`     | `expectedRevision`, `commands`             | Nouveau projet après lot atomique       |
| `project_load_data` | `expectedRevision`, `project`              | Charge un projet v1 complet             |
| `project_undo`      | `expectedRevision`                         | Annule le dernier changement            |
| `render_frame`      | `time`                                     | PNG 960 × 540 et temps global effectif  |
| `render_storyboard` | `times` (2 à 8 valeurs)                    | Images PNG horodatées                   |
| `project_save`      | `filename`, `overwrite` (false par défaut) | Chemin du JSON sauvegardé               |
| `project_open`      | `filename`, `expectedRevision`             | Recharge un JSON du dossier autorisé    |

`filename` accepte uniquement un nom simple terminé par `.json`, avec lettres ASCII, chiffres, `_` ou `-`. Les chemins absolus et `../` sont refusés. Limite de chargement : 5 Mo. Les erreurs d’outil portent `isError: true` et un texte explicatif. Le serveur ne contient pas de service de voix ni de génération IA.

Les révisions concernent une session de serveur. Deux processus ont des états indépendants ; utiliser des fichiers distincts pour éviter qu’ils écrasent leurs sauvegardes. Aucune coordination entre processus n’est annoncée dans cette version.

## Exemple de boucle agent

1. Appeler `capabilities`, puis `project_get`.
2. Lire les IDs et conserver `revision`.
3. Modifier les objets retournés ; les remplacements exigent l’objet complet.
4. Appeler `project_apply` avec `expectedRevision` et les commandes.
5. Appeler `render_storyboard` à plusieurs instants pour observer mouvement, placement et textes.
6. Corriger avec la nouvelle révision ; en cas de conflit, relire le projet avant de réessayer.
7. Appeler `project_save` et communiquer le chemin à l’utilisateur.
8. Dans l’éditeur, « Ouvrir » permet de charger ce JSON et d’exporter la vidéo.

Un agent doit pouvoir interpréter les images pour juger l’aspect visuel. La planche d’images ne prouve pas la fluidité ou la synchronisation audio. Le retour vidéo MCP est un prochain jalon.

### Exemple de commande

Renommer le projet à la révision 0 :

```json
{
  "expectedRevision": 0,
  "commands": [
    { "type": "project.rename", "name": "Bienvenue dans notre équipe" }
  ]
}
```

Pour `actor.replace`, fournir `sceneId` et l’objet `actor` complet reçu dans `project_get`. Propriétés : `id`, `name`, `x`, `y`, `scale`, `color`, `skin`, `action`, `start`, `end`, `moveX`, `dialogue`, `flip`.

Le point `(x, y)` correspond aux pieds, en pixels dans le canevas 1280 × 720. `moveX` exprime le déplacement total durant `[start, end]`. La durée et les temps sont en secondes. Les couleurs sont au format hexadécimal `#rrggbb`.

## API dans le navigateur

Disponible après le montage de l’éditeur, par la console ou un agent de navigateur autorisé sur cette page. API navigateur **v2**, documents de projet toujours **v1**.

`help()` fournit la référence complète, également consultable dans le panneau **Agents**. `schema()` fournit les JSON Schemas draft-07 du projet et du tableau attendu par `apply`, générés depuis les schémas Zod. Les enums, bornes et champs obligatoires y figurent. Les unités et contraintes entre champs (IDs uniques, fin après début, durée de scène) sont indiquées séparément : appeler `validate()` pour la validation complète.

Exemple :

```js
const project = window.animatelier.getProject();
const scene = project.scenes[0];
const actor = scene.actors[0];

window.animatelier.apply([
  {
    type: "actor.replace",
    sceneId: scene.id,
    actor: { ...actor, action: "walk", moveX: 250 },
  },
]);

window.animatelier.seek(2);
const svg = window.animatelier.renderSvg(2);
const pngBlob = await window.animatelier.renderPng(2);
```

`getProject()` retourne une copie. La modifier seule ne change pas l’éditeur ; passer par `apply()`. `apply(commands)` et `load(document)` renvoient maintenant `{ok: true, project, duration, warnings}`. **Adaptation des anciens clients :** remplacer `const p = api.apply(...)` par `const {project: p} = api.apply(...)`. Les erreurs Zod continuent à être levées et les lots restent atomiques. `load(document)` remplace le projet après validation et permet l’annulation. `seek()` change l’aperçu. `renderSvg()` et `renderPng()` retournent des résultats sans modifier le projet. Une erreur de validation lève une exception ; un lot invalide ne s’applique pas partiellement.

L’API navigateur est une interface JavaScript locale à la page, pas une API REST publique et pas un serveur MCP. Aucun secret ne doit être injecté dans le code frontend pour tenter de la transformer en API distante.

### Vérification sans captures

```js
const api = window.animatelier;
const verdict = api.validate(projet); // ne change rien à l’éditeur
if (!verdict.ok) console.log(verdict.errors); // chemins et messages Zod
else api.load(projet);
const état = api.getStateAt(2.5);
console.log(état.scene, état.actors.filter(a => a.visible));
```

`getStateAt` utilise les mêmes fonctions de pose que le SVG : temps global borné, scène active et temps local, positions aux pieds, visibilité, action, orientation dérivée de `flip`, dialogue affiché et articulations. Les personnages invisibles sont inclus avec `visible: false` et un dialogue vide. Le format v1 conserve une fin de présence inclusive : deux segments se touchant à la même seconde peuvent être visibles ensemble à cet instant. La fonction ne prétend pas mesurer l’occlusion ou le découpage de la bulle à l’écran.

### Copies locales

`save()` archive le projet par ID dans le localStorage de cette origine. `saveAs(nom)` crée un nouvel ID, archive cette copie et la charge comme projet courant ; la copie précédente déjà sauvegardée est conservée. Les erreurs de quota remontent au client et un échec de `saveAs` ne modifie pas le projet. Utiliser `listSaved()` et `openSaved(id)` pour retrouver ces copies après rechargement. Le bouton « Sauvegarder » continue de télécharger un JSON : les copies locales ne remplacent pas cette sauvegarde durable et ne sont pas partagées entre navigateurs.

### Export vidéo depuis un agent

```js
const exportEnCours = api.exportVideo();
// Pendant l’attente, depuis un autre appel :
api.getExportState(); // status, progress entre 0 et 1 ; error en cas d’échec
// api.cancelExport();
const résultat = await exportEnCours;
// résultat : ok, url (blob:), mimeType, size, duration
const fichier = await (await fetch(résultat.url)).blob();
// Récupérer ou télécharger le fichier avant de libérer son URL :
api.releaseExport(résultat.url);
```

Un seul export est autorisé à la fois. Les mutations API sont bloquées pendant l’export, qui travaille sur un instantané. Le WebM reste silencieux et produit en temps réel ; garder l’onglet visible. L’URL blob appartient à cette page et ne constitue pas une URL publique : le client navigateur doit récupérer le fichier avant fermeture. Les étapes de décodage SVG, d’encodage PNG, de démarrage et de finalisation vidéo ont une limite d’attente de dix secondes chacune. Le chronomètre attend le démarrage effectif de l’encodeur pour éviter les fichiers vides sur les films courts. Les longs exports doivent être lancés puis suivis avec `getExportState()` si l’outil agent impose un délai court à ses appels.

## Prochaines évolutions

Synchronisation opt-in éditeur/agent, révisions partagées, images clés, édition par patch typé, commandes de caméra et dialogues temporisés. Pour le MCP distant : authentification, contrôle d’accès aux projets, gestion des sessions, protection contre les requêtes intersites et quotas de rendu avant exposition réseau.
