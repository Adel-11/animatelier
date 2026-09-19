# Animatelier

Un premier studio d’animation 2D dans le navigateur, conçu pour évoluer avec plusieurs agents de développement. Version **0.2.0 — alpha**.

## Démarrer

Installer Node.js 22.12+ (ou Node.js 24), ouvrir un terminal **dans ce dossier**, puis :

```sh
npm ci
npm run dev
```

Ouvrir l’adresse locale affichée. La scène de démonstration est prête à lire. Ajouter un personnage depuis le casting, le déplacer, choisir un mouvement dans le panneau droit, puis exporter.

Pour les formes et les pivots, ouvrir `examples/formes-et-pivots.animatelier.json` : un rectangle tourne autour de son coin avec easing, accompagné de texte, lignes, ellipse et groupe.

Les projets utilisent désormais `schemaVersion: 2`. Les anciens fichiers v1 ne sont plus acceptés ; cette rupture a été autorisée par le propriétaire.

Pour un exemple plus complet, ouvrir `examples/rencontre-30s.animatelier.json` avec le bouton « Ouvrir » : trois scènes et trente secondes d’animation éditables.

## Disponible

- Quatre variantes de personnages originaux articulés, cinq mouvements procéduraux, quatre décors.
- Tracés SVG progressifs, masques de groupe rect/ellipse/path et compteurs animés dans les textes. Démo : `examples/trace-masque-compteur.animatelier.json`.
- Formes rect/ellipse/line, texte libre, groupes imbriqués, pivots, couches et images clés avec cinq interpolations. Panneau Éléments pour ajouter et modifier les objets et leurs clés.
- Plusieurs scènes, titre, bulles de dialogue, déplacement horizontal, échelle, orientation, couleurs et plages temporelles.
- Lecture et recherche temporelle, déplacement à la souris, annuler/rétablir.
- Sauvegarde automatique dans le navigateur et import/export JSON versionné.
- Capture PNG et export WebM 720p dans le navigateur, en temps réel et sans audio.
- API `window.animatelier` v2 : aide et schémas intégrés, validation, inspection à un instant, copies locales et export vidéo avec progression.
- Serveur MCP local avec commandes, contrôle de révision, validation, inspection temporelle, images PNG et sauvegarde.
- Validation des données, tests unitaires, intégration MCP et parcours navigateur.

## Limites assumées

C’est un socle fonctionnel, pas encore un équivalent complet de Vyond. Pas encore d’import de rigs externes, d’éditeur d’os, de pistes d’actions multiples, de voix, de synchronisation labiale audio, de MP4, de comptes ou de partage cloud. Les variantes du casting utilisent le même rig procédural.

Le projet reste dans le navigateur concerné. Effacer ses données efface cette copie ; télécharger le JSON pour une sauvegarde durable. L’enregistrement n’est pas partagé entre onglets, navigateurs ou appareils. Le MCP conserve sa session en mémoire : sauvegarder explicitement avant de l’arrêter.

L’export WebM dépend des performances du navigateur ; ce n’est pas encore un export image par image à cadence garantie. Garder l’onglet visible pendant l’export. Aucun service payant ni clé IA n’est requis par cette version.

## Guides

- [Déployer avec GitHub et Netlify](DEPLOIEMENT.md)
- [Connecter un agent et utiliser l’API](docs/API-MCP.md)
- [Architecture et contrats](docs/ARCHITECTURE.md)
- [Feuille de route](docs/ROADMAP.md)
- [Provenance des ressources](docs/ASSETS.md)
- [État du développement et reprise](REPRISE.md)
- [Règles pour les agents développeurs](AGENTS.md)

## Vérifier

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Pour employer Chrome déjà installé sous PowerShell :

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm run test:e2e
```

`npm test` couvre le moteur et un vrai client MCP. Les tests navigateur vérifient la création, l’annulation, la persistance, les exports et la disposition mobile. GitHub Actions exécute les tests et la compilation à chaque push et pull request.

## Organisation

```text
apps/editor/          Interface React, stockage local, exports navigateur
apps/mcp/             Serveur MCP stdio local
packages/core/        Schémas, commandes transactionnelles, historique, moteur
packages/renderer/    Production SVG indépendante du DOM
tests/                Contrats, intégration MCP, parcours navigateur
docs/                 Architecture, API, roadmap, registre des ressources
```

Les dépendances exactes sont verrouillées dans `package-lock.json`. Ne pas déduire une licence de redistribution du code de la disponibilité de son dépôt : la licence du produit reste à choisir par son propriétaire.
