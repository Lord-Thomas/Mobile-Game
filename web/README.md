# V1 - Jeu web 3D evolutif

Base V1 conforme au manifeste:
- React + Vite
- Three.js + React Three Fiber + Drei
- White room minimale
- Personnage simple controllable
- Deplacement + saut
- Camera lisible
- Controles clavier et tactiles
- Deploiement Vercel connecte au repo GitHub

## Lancement standard

```bash
npm install
npm run dev
```

## Lancement avec le Node portable de ce repo (si npm global absent)

Depuis `C:\Users\thoma\Documents\New project\web`:

```powershell
..\node-v20.19.0-win-x64\node.exe .\node_modules\vite\bin\vite.js --host
```

Build production:

```powershell
..\node-v20.19.0-win-x64\node.exe .\node_modules\vite\bin\vite.js build
```

## Controles

- Clavier: `WASD` ou fleches
- Saut: `Espace`
- Mobile: boutons tactiles en bas de l'ecran

## Deploiement Vercel

- Projet Vercel relie au repo GitHub
- Root Directory Vercel: `web`
- Chaque `push` sur `main` declenche un redeploiement automatique en production
- Chaque `push` sur une autre branche declenche un lien preview

## Sauvegarde joueur Supabase

1. Creer un projet Supabase.
2. Dans Supabase, ouvrir SQL Editor et executer `supabase/player_progress.sql`.
3. Copier `web/.env.example` vers `web/.env.local`.
4. Renseigner:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_SUPABASE_REDIRECT_URL=http://127.0.0.1:5173
```

5. Dans Supabase Auth, ajouter les URL du jeu dans les redirect URLs:
   - local: `http://127.0.0.1:5173`
   - mobile local si besoin: `http://IP_DE_TON_PC:5173`
   - production: URL Vercel du jeu
6. Dans Supabase Auth > Providers > Email, activer Email/Password.
   Pour le prototype, desactiver "Confirm email" si tu veux que la creation de compte connecte le joueur directement sans quitter le jeu.
7. Sur Vercel, ajouter les memes variables d'environnement au projet `web`.

Sans ces variables, le jeu reste en sauvegarde locale.

## Workflow recommande

- Garde `main` stable
- Fais les tests sur des branches de feature, puis merge sur `main` quand c'est valide
