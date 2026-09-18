# Point de reprise — 18 septembre 2026

## État

Le premier socle v0.1 est implémenté et compilé. Il est prêt à être placé dans un dépôt GitHub dédié puis connecté à Netlify, selon DEPLOIEMENT.md. Aucun dépôt distant ni déploiement Netlify n’a été créé dans cette session. Les ressources originales intégrées suffisent à essayer le parcours complet ; aucune ressource externe riggée n’a encore été téléchargée.

## Fonctionnel

- Éditeur React/TypeScript : personnages, décors, scènes, propriétés, déplacement souris, timeline, lecture, historique.
- Format JSON v1 validé, commandes atomiques, moteur temporel indépendant de React.
- Rendu SVG commun à l’éditeur, aux captures et au serveur MCP.
- Sauvegarde navigateur, import/export JSON, capture PNG, export WebM silencieux en temps réel.
- Neuf outils MCP stdio : lecture, capacités, édition, chargement, annulation, images, storyboard, sauvegarde et ouverture.
- API JavaScript de la page pour un agent de navigateur.
- Exemple éditable de 30 secondes dans `examples/rencontre-30s.animatelier.json`.
- Guide de déploiement, guide MCP, architecture, feuille de route et instructions AGENTS.md.

## Vérifications effectuées

- `npm test` : **10 tests réussis**, dont un vrai client MCP avec création/édition, contrôle des conflits, image PNG, sauvegarde et rechargement.
- `npm run build` : compilation TypeScript et production Vite réussies.
- Playwright avec Chrome installé : **3 parcours réussis** (édition/historique/persistance, mobile/scènes, PNG/WebM).
- Captures desktop et mobile inspectées ; vignettes corrigées après inspection.
- Dernier audit npm après installation du formateur : **0 vulnérabilité signalée**.

La vérification visuelle n’est pas une garantie de performance avec 40 personnages ni de fidélité sur tous les navigateurs. Le déploiement Netlify reste à vérifier après connexion aux comptes.

## Quotas

Dernière lecture durant la finalisation : **38 % restants sur cinq heures**, **49 % sur la semaine**. Valeurs ponctuelles, partagées avec les autres tâches ; les relire au prochain démarrage. Aucun crédit de réinitialisation utilisé. Seuil convenu pour arrêter les nouveaux développements : **15 % restants** dans l’une des fenêtres. Ce jalon est terminé avant d’atteindre ce seuil. Aucun suivi ou redémarrage en arrière-plan n’est configuré.

## Lancer et vérifier

```powershell
Set-Location 'C:\Users\mekka\OneDrive - Gaia Refinery\04-App\Animatelier'
npm ci
npm test
npm run dev
```

Sur cette machine, le raccourci npm était défectueux. Contournement utilisé :

```powershell
node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' test
node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run dev
```

Le sandbox Codex empêchait esbuild de lire certains dossiers parents ; l’installation réseau, les compilations et les tests ont fonctionné avec les permissions d’exécution autorisées. Ne pas désactiver les protections de la machine ni modifier son installation pour contourner ce point.

## Priorités suivantes

1. Déployer l’éditeur depuis un dépôt contenant uniquement Animatelier.
2. Découper `apps/editor/main.tsx` en composants et hooks, à comportement constant.
3. Ajouter regroupement des modifications dans l’historique, autosaves et récupération de projets.
4. Définir le contrat d’images clés et de rigs avec migration v1 → v2 avant toute implémentation concurrente.
5. Ajouter le pont live éditeur/MCP avec révisions et permissions explicites.
6. Qualifier un premier format de personnages externes et vérifier les licences avant import.
7. Ajouter audio, visèmes, puis export MP4 reproductible.

## Limites à annoncer clairement

Pas encore de synchronisation live entre MCP et éditeur, de serveur MCP hébergé, de compte cloud, de collaboration temps réel, de voix, de MP4, de synchronisation labiale audio ou d’import de rig externe. Le MCP renvoie des images, pas encore des vidéos. Le WebM s’exporte en temps réel et peut perdre des images sur une machine lente. Une session MCP conserve son état en mémoire jusqu’à sauvegarde explicite. Les projets navigateur ne sont pas synchronisés entre onglets.

## Prompt de reprise suggéré

> Continue le développement d’Animatelier depuis ce dossier. Lis AGENTS.md et REPRISE.md, consulte les quotas, puis prends la prochaine mission de docs/ROADMAP.md. Préserve les projets v1 et les commandes partagées ; vérifie le résultat et actualise ce point de reprise. Arrête les nouvelles fonctionnalités si une fenêtre de quota arrive à 15 % restants.
