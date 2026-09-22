# Point de reprise, 22 septembre 2026 — questionnaires modulaires

Le générateur de quiz classique accepte désormais `choices`, `list` et `cards`, quatre mises en page (`classic`, `game-show`, `minimal`, `presenter`), quatre mouvements d’entrée, quatre affichages de progression, des libellés personnalisés et des métadonnées par question (`hint`, `explanation`, `points`, surcharge de thème). Un présentateur est compilé comme un vrai personnage v2 animé ; son dialogue de réponse commence à la révélation. Le mode `levels` existant reste disponible par le même schéma.

Trois thèmes sûrs ont été ajoutés (`game-show`, `neon`, `paper`) en plus des thèmes existants ; les objets de thème permettent toujours couleurs, fond uni/dégradé/motif, typographie, formes et logo `asset:`/`file:`. Sept exemples sont exposés dans `window.animatelier.help().quiz.examples`, le MCP et le panneau Quiz : liste progressive, QCM, jeu télévisé avec échelle de gains, présentateur animé, cartes mémoire, direction artistique complète et défi vertical à niveaux. L’interface utilise une grille responsive de presets et tient sur 390 px.

L’API navigateur est maintenant disponible avant la fin de l’hydratation IndexedDB. Une commande ou un `seek` agent précoce est conservé et empêche l’hydratation tardive d’écraser le travail ; les projets sans images sont restaurés synchroniquement au rechargement. Cela corrige la course observée dans les parcours agent, édition, pistes et compteurs.

Vérifications locales Windows/Node 24/Chrome : `npm test` 64/64, `npm run build` réussi, `npm run test:e2e` 15/15 en quatre workers. Les captures `quiz-game-show.png` et `quiz-presenter.png` ont été inspectées ; le parcours Quiz mobile ne déborde plus. Le build conserve l’avertissement connu sur les gros chunks de polices/données. Aucun déploiement Netlify vérifié.

Quota avant finalisation : 59 % restants sur cinq heures et 78 % hebdomadaire. Aucun crédit de réinitialisation utilisé.

---
# Point de reprise, 21 septembre 2026 (soir)

## Retours agent vidéo : 5 bugs et 5 évolutions

Bugs corrigés : fetch-assets passe par HTTPS_PROXY (tunnel CONNECT, NO_PROXY, contrôles conservés) avec User-Agent configurable (défaut `Animatelier/0.2 (+https://animatelier.netlify.app)`, `--user-agent`, `ANIMATELIER_USER_AGENT`) ; « RÉPONSE » (caractère de remplacement dans le source) ; libellés FR NIVEAU / SUR ; chiffres du compte à rebours qui se chevauchaient sur une image (fin une demi-image plus tôt) ; QCM portrait en cartes lisibles sur deux colonnes, bonne réponse colorée à la révélation. Pastille de niveau centrée sur son fond.

Évolutions : `imageLayout` compact/hero (734 px pour une image carrée en 9:16), `imageCard` (spec et question) ; `read` par question et `timing.read: "voice"` + `--voice-durations` avec `readPad` ; `say`, `sayAnswer`, `intro.say`, `levels[].say`, `outro.say` copiés tels quels ; `apps/cli/mux-audio.js` (vidéo copiée, AAC 128k 48 kHz stéréo, sans elst, `--keep-sfx`) ; `--cover-image`. Doc dans docs/QUIZ-VIDEO.md, tests dans tests/levels-v3.test.ts.

Vérifications (cloud Linux, Node 22, ffmpeg 7) : npm test 63/63, npm run build OK. Image upload.wikimedia.org téléchargée derrière HTTPS_PROXY. Rendu complet d'une spec FR 9:16 hero + voice (43 s) avec --cover-image et --sfx : pas de chevauchement de chiffres, couverture logo 1080x1920, aucune elst. mux-audio sur la vidéo QFF de 178 s : framemd5 vidéo identique, AAC 48 kHz stéréo 128k.

Non vérifié : parcours Playwright, rendu dans l'éditeur navigateur des nouvelles mises en page (le mode voice exige le fichier de durées, donc pas utilisable dans l'éditeur). Derrière un proxy sans DNS local, la résolution finale est faite par le proxy. mux-audio suppose une vidéo sans B-frames (cas du pipeline) pour des horodatages identiques.

---
# Point de reprise, 21 septembre 2026

## Spec QUIZ-VIDEO-SPEC livrée (lots 1 à 6)

Lots 3 à 6 déjà commités (thèmes, gabarit niveaux, commande quiz-video.js, cache raster, workers par défaut). Ce commit ajoute le lot 1 (élément image générique : asset:/file:, fit, radius, blur, pixelate, zoom/focus, décodage réel PNG/JPEG/WebP, plafonds, import éditeur via IndexedDB, render.js --assets-dir) et le lot 2 (brands/qff avec logo fourni, fetch-assets.js avec liens Drive, manifest.lock.json, cache sans écrasement), plus backdrop de scène (uni, dégradé, motif) et la doc (README, HEADLESS, QUIZ-VIDEO, ASSETS, API-MCP, ARCHITECTURE).

Vérifications (Linux, Node 22, ffmpeg 7) : npm test 53/53, npm run build OK. Critère 1 : projets-videos/qff-pipeline/spec-exemple.json rendu par `node apps/cli/quiz-video.js spec-exemple.json --out out --theme qff --preview auto`, six fichiers produits, logo intro et coin compris, mise en page équivalente à qff-levels-1.mp4 à l'oeil (captures comparées à 1 s, 19,1 s, 30 s). ffprobe : H.264 High yuv420p, 30/1 constant, 5343 images, 178,1 s, aucune boîte elst.

Non vérifié : parcours Playwright (tests/browser/images.spec.ts) non lancés dans cette session ; téléchargement réel d'un lien Drive public (conversion et refus non-image couverts par tests) ; différence mineure de largeur de la pastille LEVEL par rapport à la référence. Deux avertissements de débit vocal sur la spec d'exemple (questions 2 et 10).

---
# Point de reprise — 20 septembre 2026

## Rendu headless livré

CLI `node apps/cli/render.js projet.json --out film.mp4 --jobs 4 --emit-timeline timeline.json`, MP4 H.264/WebM VP9, resvg CPU avec polices DejaVu embarquées, temps f/fps, recadrage et taille finale. CLI quiz autonome. MCP project_render_video et render_status partagent l’encodeur, avec un job actif et sorties limitées au dossier autorisé. render_frame utilise le même rasteriseur à résolution native.

Extensions v2 compatibles : canevas 16–4096 px, fps 1–60, fontFamily DejaVu Sans/Mono, blur 0–50 animé sur tous les éléments/groupes, maxWidth du texte. Les décors sont cadrés au centre ; les objets restent en pixels natifs. Aperçu, export navigateur et renderer partagent police et SVG. Titres, bulles et nouveaux quiz emploient les avances réelles des TTF. Provenance et licences dans docs/ASSETS.md ; options et limites dans docs/HEADLESS.md.

Vérifications locales Windows/Node 24 : 34 tests passent (moteur, hashes de trois images, MP4/WebM avec ffprobe, timestamps, deux rendus à 1/2 workers identiques après décodage, CLI quiz et vrai SDK MCP). Compilation réussie. Les 12 parcours navigateur existants passent ; nouveau parcours portrait passé après correction de la validation blur sur tous les types, puis repassé après les retouches finales. Captures portrait desktop/mobile inspectées. Vite signale les gros chunks de polices ; les données base64 d’export sont chargées à la demande.

Critère complet local : examples/quiz-list.animatelier.json rendu avec 4 workers, ffprobe confirme H.264 1280×720, 30/1 i/s, 1500 images, durée 50.000000 s. Sorties de contrôle ignorées dans agent-projects/quiz-headless.mp4 et quiz-timeline.json. La CI existante Ubuntu/Node 22 exécute aussi les nouveaux tests via npm test ; son résultat distant reste à vérifier après push.

Limites : vidéos silencieuses (option manifeste retenue, mixage audio intégré non livré) ; manifeste de présence start/end, pas détection de visibilité optique ; reconnaissance des quiz par IDs stables. Rasterisation Chrome/resvg peut différer en anticrénelage. Resvg-js ne partage pas une base de polices entre constructeurs. Pas de reprise durable ni annulation MCP. Rendu de scripts complexes et polices externes non pris en charge. Les anciens projets restent valides, mais la police par défaut et les retours des nouveaux quiz peuvent changer. Pas de déploiement Netlify vérifié.

Quotas avant vérification finale : 60 % restants sur cinq heures, 76 % hebdomadaire ; aucun crédit de réinitialisation utilisé. Aucun suivi automatique. Fichiers utilisateur préexistants animatelier-evolutions-integrale.md, docs/RENDU-HEADLESS.md et projets-videos/ laissés hors commit.

---
# Point de reprise — 19 septembre 2026

## Lot personnages terminé : pistes, mains et oscillations

Ajouts compatibles v2 : actor.timeline (100 segments maximum), toX absolu, poses hold/point, dialogues de segment avec bouche animée, attachment sur les éléments racines, wobble numérique déterministe. Champs absents : comportement précédent conservé. Le rendu SVG et getStateAt partagent les matrices du corps et des mains ; opacité/visibilité et couches héritées pour les objets attachés. Références invalides et suppressions laissant une attache orpheline rejetées atomiquement.

Interface : une ligne par personnage avec plusieurs segments, éditeurs JSON de piste et oscillations dans les propriétés, sélection du personnage et de la main dans Éléments. Correction de clés React dupliquées qui pouvaient accumuler les panneaux Masque après édition ; panneau Éléments défilable sans étirer la scène sur desktop.

Guide complet : docs/PERSONNAGES.md, intégré dans Agents et help().motion.guide / capabilities.schema.motion.guide. Exemples et règles de priorité, temps, bornes, limites documentés. Démo prête à ouvrir : examples/personnage-et-objet.animatelier.json (8 secondes, marcher/tenir/montrer/repartir).

Validation : 30 tests moteur/SDK MCP réussis ; douze parcours Chrome validés. La première passe avait un sélecteur d’aide quiz devenu ambigu après ajout du guide personnages ; corrigé et parcours quiz rejoué. Les parcours attaches et masques ont été revérifiés après les retouches UI. Pixels PNG d’un objet à la main vérifiés avec et sans retournement, tests des frontières, priorités et rejets atomiques. Compilation finale réussie ; captures desktop/mobile inspectées. Les exports WebM existants ont passé les tests de non-régression.

Limites : édition des pistes par JSON, changements de pose sans interpolation, retournement explicite, cadence du pas non calibrée sur la vitesse. Attaches seulement aux mains des personnages, uniquement éléments racines (groupes autorisés), pas d’occlusion automatique des doigts ni conservation de la position mondiale en détachant. Pas encore de casting partagé ou de piste de dialogues indépendante. Oscillations sinusoïdales constantes, bornées, sans bruit aléatoire. MCP indépendant de l’éditeur ; aucun déploiement Netlify vérifié.

Prochaine mission : transitions/freeze/caméra selon le cahier générique. Le document utilisateur non suivi animatelier-evolutions-integrale.md reste inchangé et hors commit.

Dernier quota avant finalisation : 29 % restants sur cinq heures, 89 % hebdomadaire. Aucun crédit de réinitialisation utilisé. Relire avant le lot suivant, arrêt des nouvelles fonctionnalités au seuil de 15 %.

## Historique du lot quiz

## Lot quiz terminé : questions et révélations génériques

Priorité ajoutée par l’utilisateur avant le lot personnages : QCM à 2–4 choix ou liste cumulative de 1–10 cases ; révélation après 3 secondes par défaut, durée de réponse réglable, couleurs personnalisables. Compilation pure vers les primitives v2 existantes (sans changement du format). Les réponses précédentes persistent dans les scènes suivantes ; un calendrier donne les instants globaux de chaque révélation.

- API navigateur : `compileQuiz(spec)` sans mutation ; `loadQuiz(spec)` charge un projet validé avec un nouvel ID et permet l’annulation. `help().quiz` contient guide complet, exemples et JSON Schema.
- Application : bouton Quiz, exemples QCM/liste de dix questions, script JSON éditable, vérification sans chargement. Guide complet dans Quiz et Agents, utilisable sur mobile.
- MCP : `quiz_compile`, pure compilation ; chargement par `project_load_data` avec révision. Guide et schémas dans capabilities. Toujours aucun pont live.
- Documentation : docs/QUIZ.md et copie intégrée quiz-guide.ts (égalité testée). Exemples prêts à ouvrir : examples/quiz-list.animatelier.json (50 s), examples/quiz-choices.animatelier.json (5 s).

Vérifications : 26 tests moteur/SDK MCP réussis ; les 11 parcours Chrome passent (9 parcours existants, 2 nouveaux parcours quiz). Un sélecteur de test ambigu a été corrigé puis les tests quiz rejoués avec succès. Compilation réussie. Captures liste vide/complète, QCM révélé et formulaires/aide mobile inspectées. Export d’un quiz de 1 s décodé en WebM 1280 × 720. Révélations aux frontières vérifiées pour les dix questions ; erreurs de chargement sans mutation et nouveaux IDs vérifiés.

Limites : export WebM silencieux en temps réel, onglet visible ; pas de MP4 ni d’export vidéo MCP. Quiz vidéo, sans interaction ni score. Retouches sur les primitives indépendantes par scène ; régénérer remplace ces retouches. Retours à la ligne déterministes mais rendu typographique à inspecter avec les polices de repli. Aucun déploiement Netlify vérifié.

Prochaine mission conservée : lot personnages (timeline d’actions, hold/point, attache main, wobble), puis transitions/freeze/caméra. Le présent lot ajoute le quiz demandé, sans annoncer ces fonctions comme livrées. Le document utilisateur non suivi animatelier-evolutions-integrale.md reste intact et exclu du commit.

Dernier quota avant finalisation : 67 % de session et 95 % hebdomadaire restants. Aucun crédit de réinitialisation utilisé. Relire au prochain démarrage ; seuil d’arrêt 15 %.

## Historique du lot 2

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
