# V1 - Jeu web 3D evolutif

Base V1 conforme au manifeste:
- React + Vite
- Three.js + React Three Fiber + Drei
- White room minimale
- Personnage simple controllable
- Deplacement + saut
- Camera lisible
- Controles clavier et tactiles

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