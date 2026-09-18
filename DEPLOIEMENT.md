# Déployer Animatelier avec GitHub et Netlify

Ce guide publie **l’éditeur web**. Le serveur MCP fourni fonctionne séparément sur votre ordinateur. Aucun compte GitHub ou Netlify n’a été créé ou modifié automatiquement pendant la préparation du projet.

## 1. Préparer l’ordinateur

Il faut un compte GitHub, un compte Netlify, Git et Node.js 22.12+ ou 24.

Ouvrir PowerShell dans le dossier de l’application :

```powershell
Set-Location 'C:\Users\mekka\OneDrive - Gaia Refinery\04-App\Animatelier'
node --version
npm --version
npm ci
npm test
npm run build
```

La dernière commande produit `dist`. Pour essayer le logiciel localement :

```powershell
npm run dev
```

Ouvrir l’adresse affichée (normalement `http://127.0.0.1:5173`). `Ctrl+C` arrête le serveur.

### Particularité détectée sur cet ordinateur

Le raccourci `npm` de la machine cherchait un fichier absent dans le profil utilisateur. Si `npm` affiche `Cannot find module ... npm-cli.js`, utiliser temporairement le fichier existant de l’installation Node :

```powershell
node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' ci
node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run dev
```

Le même préfixe fonctionne pour `test` et `run build`. Ce contournement ne modifie pas l’installation de Node. Sur un autre ordinateur, vérifier le chemin de son installation ou réparer Node.

## 2. Mettre uniquement Animatelier dans GitHub

Sur GitHub, créer un dépôt nommé par exemple `animatelier`. Un dépôt privé convient. Pour éviter un conflit au premier push, créer un dépôt vide, sans README, licence ou `.gitignore` générés par GitHub.

**La racine de ce dépôt doit être le dossier Animatelier, pas votre dossier OneDrive complet.** Le fichier `package.json` doit apparaître à la racine du dépôt GitHub.

Depuis le dossier Animatelier :

```powershell
git init -b main
git add .
git status
git commit -m "Initialiser Animatelier"
git remote add origin https://github.com/VOTRE_COMPTE/animatelier.git
git push -u origin main
```

Remplacer `VOTRE_COMPTE`. Si le dépôt local ou son premier commit existent déjà, ne pas refaire leur création : `git status` et `git remote -v` permettent de voir l’état. Si Git demande votre identité, configurer votre nom et votre adresse pour ce dépôt, puis recommencer le commit.

Le `.gitignore` exclut les dépendances, le cache npm, les exports de compilation, les secrets et les projets créés par le MCP. Vérifier `git status` avant le commit. Ne jamais ajouter de jeton dans un fichier ou dans l’URL du dépôt.

## 3. Connecter Netlify

Dans Netlify, choisir l’ajout d’un projet à partir d’un dépôt existant, sélectionner GitHub, autoriser l’accès au dépôt `animatelier`, puis le sélectionner.

Utiliser ces réglages :

| Réglage               | Valeur                                                  |
| --------------------- | ------------------------------------------------------- |
| Branche de production | `main`                                                  |
| Dossier de base       | Vide, puisque le dépôt contient directement Animatelier |
| Commande de build     | `npm run build`                                         |
| Dossier à publier     | `dist`                                                  |
| Version de Node       | `22`                                                    |
| Variables secrètes    | Aucune pour cette version                               |

Le fichier `netlify.toml` contient déjà les réglages de compilation, le dossier public et les en-têtes HTTP. Netlify préconise bien `npm run build` et `dist` pour Vite. [Documentation officielle Vite sur Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/vite/)

Lancer le déploiement et attendre son succès avant d’ouvrir l’adresse attribuée. Si vous utilisez un dépôt qui contient plusieurs applications, définir comme dossier de base le chemin relatif d’Animatelier dans ce dépôt.

## 4. Vérifier le résultat

1. Ouvrir l’adresse Netlify sur Chrome ou Edge récent.
2. Lire la scène de démonstration.
3. Ajouter un personnage et modifier son animation.
4. Télécharger un projet avec « Sauvegarder », puis le rouvrir.
5. Télécharger une image PNG et une courte vidéo WebM.

Les projets sont enregistrés dans le navigateur, **pas sur Netlify**. Changer l’adresse du site ou de navigateur crée un espace de sauvegarde différent. Le fichier JSON permet de transporter un projet.

## 5. Publier les changements suivants

Après chaque modification terminée :

```powershell
npm test
npm run build
git add .
git commit -m "Décrire la modification"
git push
```

Netlify reconstruit le site après le push sur la branche connectée. Attendre la fin du déploiement pour voir les changements. Le workflow GitHub vérifie le code séparément : le déploiement Netlify n’attend pas automatiquement son résultat.

Pour plusieurs agents : une branche par mission, une pull request par changement, puis intégration sur `main` après revue et vérifications. Activer les Deploy Previews de Netlify pour examiner les branches avant leur fusion. Définir les protections de branche GitHub selon les possibilités du compte.

## 6. Gratuité et consommation

Cette version est un site statique et n’appelle aucun service IA payant. L’animation et la vidéo sont calculées sur l’ordinateur du visiteur. L’utilisation de Netlify reste soumise aux limites et conditions du forfait choisi : contrôler les quotas dans le compte, particulièrement si beaucoup d’agents déclenchent des déploiements. Ce guide ne garantit aucun volume gratuit.

Ne configurer ni service payant ni augmentation automatique de budget sans le décider explicitement. Les futures voix IA, le stockage partagé et les rendus serveur pourront introduire des coûts indépendants.

## 7. Retour arrière et dépannage

**Build rouge :** ouvrir les logs Netlify, vérifier la version de Node, la présence de `package-lock.json`, la commande et le dossier de base. Reproduire `npm ci` puis `npm run build` localement.

**Page vide :** vérifier que `dist` est le dossier publié et que les fichiers JS/CSS se chargent. Ouvrir la console du navigateur pour relever l’erreur exacte.

**Pas de nouvelle version :** contrôler la branche liée et l’état du dernier déploiement. Un push n’est pas un déploiement terminé.

**Régression :** republier un déploiement précédent fonctionnel dans Netlify. Corriger également Git avec un commit de correction ou `git revert IDENTIFIANT_DU_COMMIT`, puis pousser. Ne pas réécrire l’historique partagé pour ce retour arrière.

**Vidéo interrompue :** garder l’onglet visible, essayer un projet court dans Chrome/Edge et relancer. Le MP4 et le mixage audio ne sont pas encore disponibles.

**Projet absent :** ouvrir le JSON téléchargé. Ne pas effacer les données du navigateur avant d’avoir sauvegardé les projets.

## 8. Connecter ensuite un agent

Suivre [le guide MCP](docs/API-MCP.md). L’adresse Netlify est l’adresse de l’éditeur ; elle n’est pas une adresse de serveur MCP. Un service MCP distant authentifié et une synchronisation live sont prévus dans la roadmap, mais ne sont pas déployés dans cette version.
