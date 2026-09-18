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
