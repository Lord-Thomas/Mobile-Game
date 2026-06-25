# CLAUDE.md — Manuel d'intervention pour l'agent

Ce fichier n'est pas une liste de fonctionnalités. C'est le cadre permanent que tout
agent (Claude Code, Copilot, etc.) doit respecter avant de modifier ce projet.
Garde-le court et à jour. Quand une règle manque ici et qu'une régression survient,
ajoute la règle ici plutôt que de la réexpliquer à chaque session.

## Pile technique

- **Frontend** : React 19 + Vite + Three.js via React Three Fiber / Drei / Rapier.
- **Multijoueur** : serveur Colyseus autonome (`server/index.js` + `server/rooms/VisitRoom.js`).
- **Persistance** : Supabase, accédé **uniquement** via `src/services/progressService.js`.
- Module ESM partout (`"type": "module"`). Pas de TypeScript.

## Commandes

```bash
npm run dev          # frontend Vite
npm run multiplayer  # serveur Colyseus local (port COLYSEUS_PORT ou 2567)
npm run lint         # ESLint — PAS ENCORE PROPRE (voir ci-dessous), informatif seulement
npm run test         # tests Vitest (logique pure)
npm run check        # test + build — DOIT passer avant tout commit
```

> **État du lint** : `npm run lint` remonte ~3700 erreurs préexistantes (mutations
> d'objets Three.js signalées par `react-hooks/immutability`, globals Node absents
> dans `vite.config.js`/`server/`). C'est de la dette de stabilisation, pas un blocage.
> Il est volontairement **hors de `check`** tant que la config n'est pas calibrée pour
> R3F + Node. Chantier à part : configurer les globals Node, assouplir la règle
> d'immutabilité sur le code R3F, puis réintégrer `lint` dans `check`.

**Règle absolue : ne déclare jamais une modification "terminée" sans avoir lancé
`npm run check` et collé le résultat réel.** « normalement ça marche » est interdit.

## Architecture — points de friction connus

- `src/App.jsx` fait ~17 000 lignes et le composant `App()` contient ~96 `useState`.
  **N'ajoute pas de nouvel état ou de nouvelle logique dans `App()`.** Extrais tout
  nouveau système dans son propre fichier (voir `src/game/`, `src/services/`,
  `src/world/` comme exemples d'extraction). Un `setState` parent re-rend tout l'arbre 3D :
  les composants de scène lourds doivent être `React.memo` (cf. `PERFORMANCE_NOTES.md`).
- `PERFORMANCE_NOTES.md` recense les pièges de perf déjà rencontrés. **À lire avant**
  de toucher au terrain, à l'herbe instanciée, au joueur distant ou aux overlays debug.

## Fichiers générés — NE PAS éditer à la main

Ces fichiers sont produits par les outils d'édition (`src/tools/`). Les modifier
manuellement crée une divergence silencieuse. Édite la donnée via l'outil concerné.

- `src/world/*.generated.js`
- `src/world/terrain/terrainModifications.generated.js` (~3,2 Mo — voir note perf ci-dessous)
- `src/world/trees/treeLibrary.generated.js`
- `public/models/player/anim/*.glb` (animations du joueur — voir note ci-dessous)

> **Animations joueur — GLB, pas FBX.** Les animations Mixamo sont chargées en GLB
> (via `useMixamoGlbAnimation` dans `App.jsx`), convertis depuis les FBX sources par
> FBX2glTF. Gain : ~15 Mo de FBX -> ~1,5 Mo de GLB, parse runtime quasi nul.
> - Sources FBX dans `anim-src/` (hors `public/`, donc NON déployées).
> - Régénérer les GLB : `node scripts/convert-anims-glb.mjs` (ou `... <nom>` pour une seule).
> - Deux pièges de la conversion, gérés par `cloneMixamoAnimationClip` : les noms d'os
>   gardent le `:` Mixamo (renormalisé `mixamorig:` -> `mixamorig`) et FBX2glTF exporte
>   les positions en mètres alors que le rig attend des cm (x100, `MIXAMO_GLB_POSITION_SCALE`).
> - Pour ajouter une animation : poser le FBX dans `anim-src/`, l'ajouter au map du script,
>   régénérer, puis `useMixamoGlbAnimation('/models/player/anim/<nom>.glb')`.

> **Terrain — `.generated.js` n'est plus chargé par le jeu.** Le runtime lit désormais
> `public/terrain/modifications.bin` (fetch async versionné anti-cache, voir `terrainReady`
> et `TERRAIN_BIN_VERSION` dans `terrainGeometry.js`). `terrainModifications.generated.js`
> reste la source de référence du script d'encodage.
>
> La sauvegarde de l'éditeur (`/dev/save-map-objects` dans `vite.config.js`) régénère
> **automatiquement** le `.bin` en même temps que le `.generated.js` — rien à faire à la main.
> Le script `node scripts/encode-terrain-bin.mjs` ne sert qu'à reconstruire le `.bin`
> hors éditeur (ex. après un merge git qui touche le `.generated.js`).
>
> Rappel : `vite.config.js` n'est lu qu'au **démarrage** du serveur — après l'avoir
> modifié, redémarrer `npm run dev`.
>
> Même principe que la collision (`mapObjectCollisionData.js` + `encode-collision-bin.mjs`).

## Règles de sauvegarde (persistance)

- **Toute donnée permanente du joueur passe par `src/services/progressService.js`.**
  Interdit d'appeler `supabase` directement depuis un composant de gameplay.
- Sans variables d'env Supabase, le jeu retombe sur la sauvegarde locale : toute
  nouvelle donnée permanente doit fonctionner dans **les deux** modes.
- Toute nouvelle fonctionnalité persistante doit déclarer, avant implémentation :
  ses données permanentes, ses données temporaires, ses valeurs par défaut, et sa
  compatibilité descendante (charger une vieille sauvegarde sans le nouveau champ).

## Règles réseau (multijoueur)

- **Le serveur Colyseus n'est PAS autoritatif : c'est un relais.** Il valide la *forme*
  des messages (`server/rooms/VisitRoom.js`), pas leur légitimité. C'est un choix de
  prototype assumé, pas un oubli. Tant que ce modèle tient :
  - ne fais pas confiance aux deltas client pour l'économie côté autres clients ;
  - la source de vérité de l'économie reste Supabase (`progressService`).
- L'autorité réseau (ennemis, combat, économie) est décrite dans
  `docs/decisions/`. **Avant d'ajouter un système multijoueur, lis l'ADR correspondante
  ou écris-en une.** Ne réinvente pas une autorité au cas par cas.
- Ne mets jamais en `useState` des données réseau à >5 Hz : utilise des `useRef` lues
  dans `useFrame` (cf. `PERFORMANCE_NOTES.md` §4).

## Processus pour toute nouvelle fonctionnalité

1. Travaille sur une branche, jamais directement sur `main`.
2. D'abord **analyser sans modifier** : systèmes touchés, état local / sauvegardé /
   réseau, qui est autoritaire, compatibilité ancienne sauvegarde, risques de régression.
3. Découper en petites étapes, chaque commit doit laisser le jeu jouable.
4. `npm run check` vert avant chaque commit.
5. Pour un bug : reproduire avec un test qui échoue → corriger → le test passe.
   Le bug devient une règle permanente (test + éventuellement une ligne ici).
