# Point de reprise — 18 septembre 2026

## État

Le socle v0.1 et le premier lot d’améliorations agents sont implémentés et compilés. Le dépôt dédié est https://github.com/Adel-11/animatelier (branche main). Le déploiement Netlify de ce lot reste à vérifier. Les ressources originales intégrées suffisent à essayer le parcours complet ; aucune ressource externe riggée n’a encore été téléchargée.

## Fonctionnel

- Éditeur React/TypeScript : personnages, décors, scènes, propriétés, déplacement souris, timeline, lecture, historique.
- Format JSON v1 validé, commandes atomiques, moteur temporel indépendant de React.
- Rendu SVG commun à l’éditeur, aux captures et au serveur MCP.
- Sauvegarde navigateur, import/export JSON, capture PNG, export WebM silencieux en temps réel.
- Onze outils MCP stdio : lecture, capacités, édition, chargement, annulation, images, storyboard, sauvegarde et ouverture.
- API JavaScript de la page pour un agent de navigateur.
- Exemple éditable de 30 secondes dans `examples/rencontre-30s.animatelier.json`.
- Guide de déploiement, guide MCP, architecture, feuille de route et instructions AGENTS.md.

## Vérifications effectuées

- `npm test` : **13 tests réussis**, dont un vrai client MCP avec création/édition, contrôle des conflits, image PNG, sauvegarde et rechargement.
- `npm run build` : compilation TypeScript et production Vite réussies.
- Playwright avec Chrome installé : **6 parcours réussis** (édition/historique/persistance, mobile/scènes, PNG/WebM).
- Captures desktop et mobile inspectées ; vignettes corrigées après inspection.
- Dernier audit npm après installation du formateur : **0 vulnérabilité signalée**.

La vérification visuelle n’est pas une garantie de performance avec 40 personnages ni de fidélité sur tous les navigateurs. Le déploiement Netlify reste à vérifier après connexion aux comptes.

## Quotas

Dernière lecture durant la finalisation : **38 % restants sur cinq heures**, **49 % sur la semaine**. Valeurs ponctuelles, partagées avec les autres tâches ; les relire au prochain démarrage. Aucun crédit de réinitialisation utilisé. Seuil convenu pour arrêter les nouveaux développements : **15 % restants** dans l’une des fenêtres. Ce jalon est terminé avant d’atteindre ce seuil. Aucun suivi ou redémarrage en arrière-plan n’est configuré.

## Lancer et vérifier

```powershell
Set-Location 'C:\Users\mekka\Documents\03-Projets\Animatelier'
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

## Connexion MCP après déplacement — 18 septembre 2026

Le dossier courant est maintenant Documents/03-Projets/Animatelier. Aucune entrée MCP Animatelier n’était présente dans la configuration Codex utilisateur ; elle a été ajoutée via codex mcp add avec les chemins absolus du nouveau dossier et un répertoire agent-projects explicite. Les 10 tests passent, dont le vrai client SDK MCP (édition, PNG, sauvegarde et rechargement), hors sandbox à cause du refus d’accès esbuild aux dossiers parents. La disponibilité dans la session Codex reste à vérifier après redémarrage du client. Le MCP et l’éditeur gardent des projets indépendants.

Compilation npm run build également réussie après cette correction de configuration.


## Lot retours agent — 18 septembre 2026

Livrés : remarques 1, 5, 6, 7, 8 et 14. API navigateur extraite dans apps/editor/agent-api.ts ; schémas, validation et inspection communs dans packages/core/agent.ts.

- help/schema : JSON Schema généré depuis Zod, enums, bornes, unités et contraintes croisées. Référence intégrée au panneau Agents, défilable sur mobile.
- validate : dry-run avec chemins et messages Zod ; getStateAt : même pose que le rendu, visibilité et dialogue à un temps global.
- API navigateur v2 : apply/load retournent {ok, project, duration, warnings}. Les anciens appels utilisant directement le retour de apply doivent lire result.project. Le JSON de projet reste v1 et la fixture existante passe.
- save/saveAs : archives locales par ID, nouvelle identité pour saveAs ; listSaved/openSaved permettent de retrouver les copies. Un quota localStorage insuffisant ne remplace pas le projet actif.
- exportVideo/getExportState/cancelExport/releaseExport : WebM, progression, annulation et URL blob récupérable. Verrou immédiat empêchant les mutations API et exports concurrents.
- Correctif vérifié : le chronomètre vidéo attend le démarrage effectif de MediaRecorder. Le test initial avait reproduit un WebM de 110 octets ; le test final décode une vidéo 1280 × 720. Décodage SVG, PNG et étapes de démarrage/finalisation bornés pour éviter des attentes indéfinies.
- MCP : capabilities inclut les schémas ; project_validate et project_state_at testés avec le vrai client SDK. Toujours aucune synchronisation avec l’onglet web.

Vérifications finales : npm test (13 réussis), npm run build et six parcours Playwright dans Chrome réussis. Captures desktop et mobile inspectées. Mesure ponctuelle avec 40 personnages : état calculé en environ 0,6 ms, PNG entre 128 et 453 ms selon la passe. Ce n’est pas une garantie de performance ; le blocage de capture de 30 s signalé par l’agent n’a pas été reproduit.

Non livrés dans ce lot : pistes d’actions, casting partagé, hors champ, orientation automatique/profil, vitesse de marche, dialogues indépendants, décors/objets/transitions supplémentaires et script haut niveau. Les remarques 2–4 et 9–13 sont détaillées dans docs/ROADMAP.md ; commencer par un contrat versionné et une migration v1 testée.

Quota avant les vérifications finales : 66 % de la fenêtre cinq heures et 41 % hebdomadaire restants. Aucun crédit de réinitialisation utilisé.
