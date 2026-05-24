# Deploiement Railway pour Colyseus

Ce projet utilise deux hebergements:

- Vercel pour le jeu React/Vite
- Railway pour le serveur Colyseus temps reel

## 1. Creer le service Railway

1. Va sur Railway.
2. Cree un nouveau projet.
3. Choisis `Deploy from GitHub repo`.
4. Selectionne le repo du jeu.
5. Dans le service Railway, mets:

```bash
Root Directory: /web
Config File Path: /web/railway.json
```

La config `railway.json` lance automatiquement:

```bash
npm run multiplayer
```

Le serveur ecoute le port fourni par Railway avec `process.env.PORT`.

## 2. Exposer le serveur en ligne

Dans Railway:

1. Ouvre le service Colyseus.
2. Va dans `Settings`.
3. Va dans `Networking`.
4. Clique sur `Generate Domain`.

Railway va donner une URL du style:

```bash
https://ton-service.up.railway.app
```

Pour le jeu, l'URL WebSocket sera:

```bash
wss://ton-service.up.railway.app
```

Tu peux tester la sante du serveur dans le navigateur:

```bash
https://ton-service.up.railway.app/health
```

La reponse doit etre:

```json
{"ok":true}
```

## 3. Brancher Vercel sur Railway

Dans Vercel, projet du jeu:

1. Va dans `Settings`.
2. Va dans `Environment Variables`.
3. Ajoute:

```bash
VITE_COLYSEUS_URL=wss://ton-service.up.railway.app
```

4. Redeploie Vercel.

## 4. Workflow de mise a jour

Quand tu pushes sur `main`:

- Vercel redeploie le frontend.
- Railway redeploie le serveur Colyseus seulement si `server/**`, `package.json`, `package-lock.json` ou `railway.json` changent.

Si tu changes une logique multijoueur cote client dans `src`, Vercel suffit.
Si tu changes une logique multijoueur cote serveur dans `server`, Railway redeploie aussi.

## 5. Local vs production

En local:

```bash
npm run dev
npm run multiplayer
```

Avec:

```bash
VITE_COLYSEUS_URL=ws://127.0.0.1:2567
```

En production Vercel:

```bash
VITE_COLYSEUS_URL=wss://ton-service.up.railway.app
```
