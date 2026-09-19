# Feuille de route et découpage agents

Chaque mission se termine par une démonstration reproductible et une intégration vérifiée. Une nouvelle version du schéma exige une migration. Les durées ne sont pas garanties : les critères de sortie définissent l’avancement.

| Jalon                | Travail                                                                                   | Critère de sortie                                                  |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 0 — Socle            | Éditeur, commandes, rendu, sauvegarde, WebM, MCP local                                    | Projet créé, observé, corrigé, sauvegardé et exporté               |
| 1 — Robustesse       | Composants UI, historique groupé, autosaves IndexedDB, accessibilité clavier, fixtures v1 | Projet récupérable après incident, ancien projet toujours lisible  |
| 2 — Animation        | Pistes, images clés, interpolations, timing des dialogues, transitions                    | Film de 30–60 s à plusieurs scènes, montable précisément           |
| 3 — Personnages      | Modèle d’os, attaches, contraintes, expressions, garde-robe                               | Plusieurs rigs indépendants animés par une bibliothèque commune    |
| 4 — Ressources       | Registre de licences, import SVG sécurisé, premier adaptateur de rig                      | Un format externe documenté importé et testé de bout en bout       |
| 5 — Audio et vidéo   | Voix importée, visèmes, waveform, mixage, MP4, rendu image par image                      | Export synchronisé et reproductible avec piste audio               |
| 6 — Agents connectés | Pont live, révisions partagées, tâches longues, aperçu vidéo MCP                          | Agent construit et corrige dans le projet visible de l’utilisateur |
| 7 — Cloud            | Comptes, stockage, permissions, jobs, budgets, observabilité                              | Projets isolés, sauvegardés et rendus avec limites contrôlées      |

## Missions indépendantes possibles dès le jalon 1

| Mission                                       | Zone principale                               | Dépendance / contrat                                  |
| --------------------------------------------- | --------------------------------------------- | ----------------------------------------------------- |
| Découper l’éditeur en composants et hooks     | `apps/editor`                                 | Aucune modification du schéma                         |
| Ajouter fixtures et tests de compatibilité    | `tests`, exemples                             | Figer des projets v1                                  |
| Renforcer historique et autosave              | `packages/core/commands.ts`, stockage éditeur | Conserver l’atomicité                                 |
| Définir modèle d’images clés v2               | Schéma + ADR                                  | Coordination avant migration                          |
| Définir contrat de rig                        | Nouveau module characters                     | Schéma séparé des assets externes                     |
| Étudier et qualifier les ressources gratuites | Registre assets et documentation              | Preuve de licence, aucun asset douteux intégré        |
| Concevoir l’export hors temps réel            | Nouveau module export                         | Consomme projet et temps explicite                    |
| Préparer le pont navigateur/MCP               | Adaptateurs agents                            | Authentification et révisions avant transport distant |

Limiter le nombre d’agents simultanés au nombre de missions vraiment indépendantes. Un agent d’intégration peut coordonner les contrats et la fusion quand l’utilisateur décide de mettre cette organisation en place. Les modifications concurrentes du même schéma, du même composant ou du lockfile doivent être séquencées.

## Format d’une mission

```text
Objectif : résultat utilisateur observable.
Périmètre : fichiers et modules possédés par cette mission.
Contrat : entrées, sorties, compatibilité, erreurs.
Hors périmètre : changements à ne pas entreprendre dans cette mission.
Acceptation : exemple vérifiable et tests pertinents.
Livraison : code, documentation et note de reprise actualisée.
```

## Points à mesurer avant extension

Cadence du rendu avec 10/40 personnages ; mémoire de l’historique ; latence des lots ; taille des projets ; fidélité SVG navigateur/Sharp ; qualité et durée des exports. Choisir PixiJS, WebCodecs, workers ou rendu serveur sur la base de ces résultats, sans coupler le format des projets à une bibliothèque.


## Retours de l’agent utilisateur — septembre 2026

Premier lot : points **1, 5, 6, 7, 8 et 14** (aide et schémas intégrés, inspection temporelle, validation dry-run, retours structurés, copies locales et export vidéo API). Les délais de capture sont désormais bornés ; le blocage de 30 s rapporté n’a pas été reproduit.

Lot suivant à concevoir avec version de projet et migration testée :

- **2, 3, 11 :** casting partagé par ID, piste d’actions par personnage et piste de répliques indépendante. Définir la priorité des pistes et les intervalles semi-ouverts avant de migrer les segments v1. L’éditeur doit permettre leur modification sans perte à la sauvegarde.
- **4, 9, 10 :** positions hors champ, orientation explicite et marche calculée en pixels/seconde. Les anciens `flip` et `moveX` doivent conserver leur rendu après migration. Les profils visuels nécessitent aussi un travail sur le rig.
- **12 :** décors maison intérieur/extérieur et porte animée, transitions. Dessiner les ressources dans le projet ou documenter leur provenance. Une coupe existe déjà au passage entre scènes ; fondu et objets animés restent à implémenter.
- **13 :** compilateur de script déterministe vers ces pistes. Le timing estimé du texte doit être réglable et présenté comme une estimation, sans prétendre fournir une synchronisation audio.

Le pont MCP live reste un chantier distinct : l’API navigateur agit déjà sur l’éditeur ouvert, tandis que le serveur MCP garde une session séparée.


## Priorité actuelle — briques génériques (19 septembre 2026)

La demande générique de formes, textes, groupes et images clés remplace la priorité précédente. L’utilisateur a autorisé l’abandon du v1, sans migration. Le lot 1 livre rect/ellipse/line/text/group, pivot, couches et interpolation ; voir FORMAT-V2.md. Les positions hors champ sont désormais possibles.

Lots restants, dans cet ordre :

1. path avec dessin progressif, clip et nombre animé dans le texte.
2. Timeline d’actions, gestes hold/point, attache à la main et wobble.
3. Transitions, freeze et caméra.
4. Décors simples/images et placement des bulles.
5. Export image par image, téléchargement direct et import/export JSON par API.

La démonstration pédagogique doit être construite uniquement avec ces briques, jamais codée en dur. Le critère d’export 60 s en arrière-plan reste à atteindre ; l’export actuel dépend toujours de la visibilité de l’onglet.


Lot 2 implémenté : path/draw, masques de groupe et nombres animés. Prochaine mission : lot 3, timeline d’actions, gestes hold/point, attache main et wobble. L’export en arrière-plan reste à réaliser au lot 6.

## Lot quiz livré — septembre 2026

Ajout prioritaire demandé par l’utilisateur : compilateur de QCM et de listes cumulatives, délai réglable (3 s par défaut), calendrier inspectable, API navigateur/MCP, création et guide intégrés à l’application. Projet v2 générique et export WebM existant. Voir QUIZ.md. Le lot personnages (timeline d’actions, hold/point, attache main et wobble) reste la prochaine mission ; il n’est pas inclus dans ce lot quiz.

## Lot personnages livré — septembre 2026

Piste d’actions, hold/point, toX, attache main de tout élément racine et oscillations déterministes. Édition JSON guidée dans l’interface et références complètes dans Agents. Démo personnage-et-objet. Prochaine mission : transitions/freeze/caméra ; casting partagé, dialogue indépendant, orientation automatique et marche à vitesse calibrée restent à traiter.
