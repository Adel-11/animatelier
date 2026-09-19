# Ressources et provenance

## Ressources actuellement intégrées

| Ressource                            | Origine                         | Format / capacité               | Référence                                               |
| ------------------------------------ | ------------------------------- | ------------------------------- | ------------------------------------------------------- |
| Rig humain simple et quatre palettes | Dessiné en code pour ce projet  | SVG procédural, cinq mouvements | `packages/renderer/svg.ts` et `packages/core/engine.ts` |
| Studio, bureau, parc, nuit           | Dessinés en code pour ce projet | Décors SVG                      | `packages/renderer/svg.ts`                              |
| Icône Animatelier                    | Dessinée en code pour ce projet | SVG                             | `public/favicon.svg`                                    |

Aucun personnage ou template provenant de Vyond, d’une bibliothèque tierce ou d’un téléchargement web n’a été intégré. Il n’y a pas encore d’importateur de rig externe. Les noms de personnages sont des exemples.

## Procédure pour intégrer des ressources gratuites

Pour chaque ressource candidate, conserver : titre, auteur, page source exacte, fichier source, date de récupération, licence et sa version, texte ou preuve de licence, attribution, droits de modification et redistribution, contraintes commerciales, format, version du logiciel d’origine, squelette et animations incluses.

Classer séparément : illustration non riggée, personnage riggé, clip d’animation, modèle de scène. Une animation vidéo ou un GIF ne constitue pas un rig éditable. La gratuité d’un téléchargement ne garantit pas l’autorisation de redistribuer l’asset dans le logiciel.

Avant intégration : valider la provenance, inspecter le fichier, passer par un importateur contrôlé, conserver l’original, produire une version normalisée et tester des poses de référence. Les licences non établies restent en attente et les fichiers concernés ne sont pas distribués.

Le choix du premier format externe sera fait après le contrat de rig interne. Ne pas promettre une conversion universelle : os, contraintes, meshes, déformations et expressions peuvent ne pas être transposables.


## Dépendance de schémas agents

`zod-to-json-schema` 3.25.2, registre npm officiel : https://www.npmjs.com/package/zod-to-json-schema/v/3.25.2. Déjà présent transitivement via le SDK MCP, ajouté en dépendance directe le 18 septembre 2026. Version et intégrité verrouillées dans package-lock.json. Aucun média externe ajouté.


`svg-path-properties` 2.1.0 (MIT), ajouté le 19 septembre 2026 depuis https://www.npmjs.com/package/svg-path-properties/v/2.1.0 ; source et documentation : https://github.com/rveciana/svg-path-properties. Sert au calcul pur JavaScript des longueurs SVG, sans DOM. Version et intégrité verrouillées dans package-lock.json. Aucun média téléchargé.
