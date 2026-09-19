# Instructions de développement — Animatelier

## Mission et contraintes

Développer un studio d’animation 2D web modulaire, déployable sur Netlify depuis GitHub et pilotable par des agents. Lire README.md, REPRISE.md et docs/ARCHITECTURE.md avant de modifier le socle.

Respecter les demandes de l’utilisateur. Ne pas activer de dépenses, réinitialiser des quotas, publier des secrets, ni télécharger de ressources sans provenance documentée. Ne jamais initialiser ou pousser le dossier OneDrive parent comme dépôt du logiciel.

## Quotas et arrêt propre

L’utilisateur demande de s’arrêter avant d’épuiser ses crédits. Lorsque l’outil de consultation est disponible, consulter le quota au début, après chaque lot substantiel et avant le dernier lot. Si une fenêtre est à 15 % restants ou moins, cesser les nouvelles fonctionnalités, sauvegarder les modifications et mettre à jour REPRISE.md avant de s’arrêter. Ne pas consommer de crédit de réinitialisation sans demande explicite. Si les quotas ne sont pas accessibles, l’indiquer ; ne pas prétendre assurer une surveillance automatique. Aucune reprise automatique n’est configurée.

## Frontières des modules

- `packages/core` ne doit importer ni React, ni DOM, ni serveur MCP.
- `packages/renderer` dépend du core et retourne une image SVG déterministe.
- `apps/editor` adapte les événements utilisateur vers les commandes du core.
- `apps/mcp` expose le même core via le SDK MCP officiel.
- Toute modification persistante passe par les commandes ou le chargement validé d’un projet.
- Ne pas ajouter directement du code d’interface dans le moteur, ni un SDK IA dans le rendu.

## Compatibilité et travail parallèle

Un responsable par module ; branches ou worktrees isolés pour des missions concurrentes. Découper en tâches avec fichiers concernés, contrat, exemple, critères d’acceptation et vérifications. Coordonner les changements du schéma et du lockfile. Les contrats partagés se modifient avant les implémentations qui en dépendent.

Exception explicitement autorisée par l’utilisateur les 18–19 septembre 2026 : les anciens projets v1 sont jetables, le format v2 ne nécessite pas de migration v1. Ne pas étendre cette exception aux versions futures : une prochaine évolution incompatible exige une nouvelle version, une migration testée et des fixtures. Valider toutes les données importées. Les commandes par lots sont atomiques ; les modifications MCP utilisent une révision attendue.

Le temps est explicite et le rendu ne doit pas dépendre du nombre d’images jouées. Échapper tous les textes dans SVG. Ne pas accepter du SVG/HTML arbitraire ou des URL externes sans modèle de sécurité défini.

## Définition de terminé

- `npm test` et `npm run build` passent.
- Pour un changement visible ou interactif : tester le parcours navigateur concerné et inspecter le rendu.
- Pour le MCP : vérifier au moins un appel avec le SDK client, pas seulement une fonction interne.
- Documenter les limites et mettre à jour REPRISE.md.
- Ne jamais annoncer un déploiement, un test ou une fonctionnalité non vérifié.

Préférer de petits changements intégrables. Ne pas commencer une refonte générale pour une fonctionnalité locale. Ne pas utiliser `npm audit fix --force` sans étudier les changements de version.
