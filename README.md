# Site Fernand Yvon Architectes

## Comment ça marche

- Tout le contenu modifiable (textes, photos, projets) est dans le dossier `content/`.
- `build.js` lit ce contenu et fabrique le site final (fichiers HTML) dans un dossier `dist/`, qui n'existe pas encore dans ce dépôt — il est reconstruit automatiquement à chaque mise à jour.
- Les images sont dans `images/`.
- Le style visuel est dans `src/style.css`.

## Modifier le contenu du site

Ne modifiez jamais les fichiers dans `content/` directement sur GitHub. Utilisez **Pages CMS** :

1. Allez sur https://pagescms.org
2. Connectez-vous avec votre compte GitHub
3. Sélectionnez ce dépôt
4. Modifiez textes et photos dans l'interface, puis cliquez sur **Enregistrer**

Chaque enregistrement dans Pages CMS déclenche automatiquement une nouvelle publication du site sur Cloudflare Pages (en général en 1 à 2 minutes).

## Réglages Cloudflare Pages

Lors de la connexion du dépôt à Cloudflare Pages, utilisez ces réglages :

- **Framework preset** : None
- **Build command** : `node build.js`
- **Build output directory** : `dist`
- **Root directory** : `/`

## Développement / vérification locale

```
node build.js
```

génère le site dans `dist/`.
