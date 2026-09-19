# Point de reprise — 19 septembre 2026

## Lot 2 terminé : tracés, masques et compteurs

Ajouts compatibles avec les projets v2 du lot 1 : path/draw et contours SVG validés (500 segments, 16 000 caractères), group.clip rect/ellipse/path, text.number et piste progress. getStateAt fournit displayText/numberValue et pathLength/drawnLength. Le panneau Éléments permet de modifier le tracé, les masques et les compteurs. Les exemples et schémas de l’API sont actualisés.

Démo : examples/trace-masque-compteur.animatelier.json. Vérifications : 23 tests moteur/SDK MCP, neuf parcours Chrome et compilation réussis. Pixels PNG de masquage et de progression vérifiés côté serveur et navigateur ; captures desktop/mobile inspectées. Dépendance svg-path-properties 2.1.0 documentée dans docs/ASSETS.md.

Limites : fill du tracé apparaît à draw=1 ; raccords de segments partiels susceptibles de différer légèrement du contour final ; masques statiques (leur groupe peut être animé) ; compteur purement visuel, sans calcul physique. Les arcs doivent fournir leurs indicateurs comme paramètres séparés. Aucun changement à l’export temps réel ni au pont MCP.

Prochaine mission : lot 3, timeline d’actions par personnage, hold/point, attache main et wobble. Dernier quota lu : 16 % de session et 25 % hebdomadaire restants. Aucun nouveau lot à entamer avant relecture des quotas ; arrêt des fonctionnalités au seuil de 15 %. Aucun crédit de réinitialisation utilisé.

## Historique du lot 1

## État actuel : lot 1 générique, v0.2

Format de projet v2, sans migration v1 : exception expressément autorisée par l’utilisateur, consignée dans AGENTS.md. Le schéma et les clés localStorage sont versionnés ; les anciens fichiers et données v1 n’ont pas été supprimés. Ne pas réintroduire une migration sans besoin nouveau.

Livré dans ce lot :

- Éléments rect, ellipse, line (flèches/pointillés), text (multiligne), group imbriqué. Transformations x/y, rotation, scale, opacity, z et pivot anchor.
- Images clés numériques : linear, easeIn, easeOut, easeInOut, step. Même moteur déterministe pour état calculé, SVG, PNG et export.
- Personnages : pistes x/y, rotation, scale, opacity, z, moveX et positions hors champ. Une piste x a priorité sur moveX. Les bulles restent droites.
- Commandes element.add/replace/remove, enfants de groupes et transactions atomiques. IDs uniques dans toute la scène, validation des bornes, temps triés, propriétés autorisées, plafonds de 200 éléments/8 niveaux/120 clés.
- Panneau Éléments : création, sélection, propriétés, pivot, éditeur de clés, suppression et historique. Les éléments racines figurent dans la timeline ; les enfants sont accessibles par la liste du panneau. Les images clés des personnages sont éditables par API ; le glisser-déposer de personnages avec pistes x/y est désactivé pour éviter une édition sans effet.
- help/schema : exemples valides pour les cinq types, schémas récursifs. getStateAt inclut l’arbre des éléments avec matrices locales/globales et opacité héritée.
- Fixture `examples/formes-et-pivots.animatelier.json` : rectangle tournant de 0 à -70° autour du coin inférieur gauche, easing et groupe, ellipse animée, ligne et texte. La fixture de rencontre est mise au format v2.

Contrat détaillé : docs/FORMAT-V2.md. Le document non suivi `animatelier-evolutions-integrale.md` présent à la racine n’a pas été modifié ; son contenu diffère du cahier générique lu dans Downloads. La priorité suivie est bien celle des briques génériques adoptée dans la conversation.

Vérifications : 20 tests moteur/SDK MCP et 8 parcours Chrome passés ; compilation réussie. Démonstration inspectée sur desktop et mobile. Les deux parcours éléments ont été repassés après les dernières retouches de timeline ; tests et compilation ont été revérifiés avec succès.

## Prochaine étape

Lot 2 : path/draw, clip et nombre animé dans un texte. Puis pistes d’actions et attache main, transitions/freeze/caméra, décors/bulles, export image par image. Aucun type spécifique aux intégrales ne doit être ajouté. La démonstration pédagogique complète et l’export de 60 secondes en arrière-plan ne sont pas encore réalisables : le WebM actuel exige toujours un onglet visible.

Pas de pont MCP live : le MCP conserve sa propre session ; window.animatelier manipule l’éditeur ouvert. Pas de changement aux services externes ni déploiement vérifié dans ce lot.

Quota avant les vérifications finales : 58 % sur cinq heures, 32 % hebdomadaire restants. Seuil d’arrêt : 15 %. Aucun crédit de réinitialisation utilisé.

## Historique des lots précédents

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
4. Images clés v2 livrées au lot générique 1 ; rigs à définir ultérieurement.
5. Ajouter le pont live éditeur/MCP avec révisions et permissions explicites.
6. Qualifier un premier format de personnages externes et vérifier les licences avant import.
7. Ajouter audio, visèmes, puis export MP4 reproductible.

## Limites à annoncer clairement

Pas encore de synchronisation live entre MCP et éditeur, de serveur MCP hébergé, de compte cloud, de collaboration temps réel, de voix, de MP4, de synchronisation labiale audio ou d’import de rig externe. Le MCP renvoie des images, pas encore des vidéos. Le WebM s’exporte en temps réel et peut perdre des images sur une machine lente. Une session MCP conserve son état en mémoire jusqu’à sauvegarde explicite. Les projets navigateur ne sont pas synchronisés entre onglets.

## Prompt de reprise suggéré

> Continue le développement d’Animatelier depuis ce dossier. Lis AGENTS.md et REPRISE.md, consulte les quotas, puis prends la prochaine mission de docs/ROADMAP.md. Respecte le contrat v2 et les commandes partagées ; vérifie le résultat et actualise ce point de reprise. Arrête les nouvelles fonctionnalités si une fenêtre de quota arrive à 15 % restants.

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
