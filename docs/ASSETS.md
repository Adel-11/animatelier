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

## Polices et rendu headless — 20 septembre 2026

- DejaVu Sans et DejaVu Sans Mono 2.37, regular/bold : fichiers TTF inchangés provenant du paquet npm `dejavu-fonts-ttf` 2.37.3, https://www.npmjs.com/package/dejavu-fonts-ttf/v/2.37.3 ; dépôt source https://github.com/senotrusov/dejavu-fonts-ttf. Copyright Bitstream et contributeurs DejaVu/Arev ; licence complète conservée dans `assets/fonts/LICENSE`. Redistribution avec notices, polices non vendables seules ; modifications DejaVu dans le domaine public selon la notice. Pas de rig ou média externe ajouté.
- `scripts/generate-fonts.mjs` copie les quatre TTF et leur licence et dérive `metrics.json` (avances normalisées) et `data.json` (mêmes octets en base64 pour export navigateur) à l’aide d’opentype.js. Les intégrités npm et versions sont verrouillées dans package-lock.json.
- `@resvg/resvg-js` : binding CPU depuis npm et paquets natifs npm ; https://github.com/yisibl/resvg-js (MPL-2.0 selon le paquet).
- `ffmpeg-static` 5.3.0 : paquet npm, binaire release b6.1.1 depuis https://github.com/eugeneware/ffmpeg-static/releases ; licence du paquet GPL-3.0-or-later, notices du binaire dans son installation. Le binaire n’est pas commité ni incorporé au bundle web.
- `@ffprobe-installer/ffprobe` : outil de vérification en dépendance de développement, binaire spécifique à la plateforme distribué sur npm. Aucun domaine de modèles, aucune API payante.

## Images génériques — 21 septembre 2026

Dépendance prévue : @noble/hashes, source npm officielle https://www.npmjs.com/package/@noble/hashes, dépôt https://github.com/paulmillr/noble-hashes (MIT). Usage : SHA-256 pur JavaScript des images dans core et navigateur, sans téléchargement de média. Version et intégrité seront verrouillées dans package-lock.json après installation.

Logo QFF : fichier fourni par le propriétaire dans projets-videos/qff-brand/qff_logo.png, copié sans modification dans brands/qff/logo.png pour usage demandé dans ses quiz. Cette fourniture ne confère pas une licence générale de réutilisation du logo à des tiers. Aucun logo téléchargé.


Validation SHA-256 : @noble/hashes installé depuis npm (version et intégrité package-lock.json). Images QFF copiées uniquement depuis le fichier fourni ; scripts et vidéo de référence consultés dans projets-videos/qff-pipeline et qff-levels-1, non publiés dans ce commit. fetch-assets consigne la provenance de chaque téléchargement dans manifest.lock.json ; la licence de chaque image fournie reste à vérifier par son utilisateur avant diffusion.
