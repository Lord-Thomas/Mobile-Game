# Notes de performance — pièges à éviter

Ce document recense les problèmes de performance rencontrés et leurs solutions.
À lire avant toute modification des systèmes concernés.

---

## 1. `RenderStatsProbe` — ne pas laisser tourner en production

**Fichier :** `src/App.jsx` — `function RenderStatsProbe`

**Problème :**
`RenderStatsProbe` faisait un `scene.traverse()` complet + un `setRenderStats(...)` toutes les 250 ms,
même quand le panneau de debug n'était pas affiché. Ce `setState` déclenchait un re-render React
à la racine de l'arbre, forçant la réconciliation de toute la scène 4×/sec.

**Symptôme :** lag général constant en multijoueur, même en intérieur.

**Solution :**
La prop `active={isDebugMode}` est passée au composant. Le `useFrame` retourne immédiatement
si `active` est `false`. Le `scene.traverse()` et le `setRenderStats` ne tournent donc
**que** quand le mode debug est activé.

```jsx
// ✅ Correct
<RenderStatsProbe onStatsChange={setRenderStats} onRendererInfo={setRendererInfo} active={isDebugMode} />
```

**Piège futur :** Si on ajoute d'autres stats ou overlays de debug, toujours les conditionner
à `isDebugMode`. Un `setState` ou `scene.traverse` inconditionnel à 4–60 Hz est catastrophique.

---

## 2. `<Html occlude>` dans la scène 3D — raycasting contre toute la scène

**Fichier :** `src/App.jsx` — `function RemotePlayer`

**Problème :**
Le label au-dessus du joueur distant utilisait `<Html occlude>` (de `@react-three/drei`).
Sans argument, `occlude` effectue un **raycasting contre tous les objets de la scène** à chaque frame
pour déterminer si le label est caché derrière quelque chose.
En extérieur avec des milliers d'instances d'herbe et d'arbres, ce raycasting devenait
de plus en plus lent au fur et à mesure que les chunks se chargeaient.

**Symptôme :** lag progressif en extérieur, qui s'aggravait avec le temps.

**Solution :** Supprimer `occlude`. Le label s'affiche toujours (même à travers les murs),
ce qui est acceptable. Si l'effet de profondeur est souhaité, utiliser `occlude="blending"`
(effet CSS pur, zéro raycasting).

```jsx
// ❌ À éviter en extérieur avec beaucoup d'objets
<Html position={[0, 1.65, 0]} center distanceFactor={8} occlude>

// ✅ Sans raycasting
<Html position={[0, 1.65, 0]} center distanceFactor={8}>

// ✅ Avec effet de profondeur mais sans raycasting
<Html position={[0, 1.65, 0]} center distanceFactor={8} occlude="blending">
```

**Piège futur :** `occlude` (sans argument) est très coûteux dès que la scène contient
des `InstancedMesh` ou de nombreux objets. Ne jamais l'utiliser en extérieur.

---

## 3. `InstancedMesh` — upload GPU partiel avec `addUpdateRange`

**Fichier :** `src/world/TerrainGroundCover.jsx` — `writeChunkToGPU` / `writeDistantGrassToGPU`

**Problème :**
Chaque fois qu'un chunk d'herbe était écrit dans le buffer GPU (via `mesh.instanceMatrix.needsUpdate = true`),
Three.js uploadait le **buffer entier** (`MAX_QUADRANT_INSTANCES × 16 floats × 4 octets ≈ 22 MB` par quadrant),
même si on n'ajoutait que quelques centaines de brins.
Avec ~256 chunks par quadrant, les uploads s'accumulaient et chaque nouvel upload était
aussi coûteux que le précédent (toujours 22 MB).

**Symptôme :** lag progressif en extérieur pendant le chargement des chunks, qui s'aggravait
au fil du temps passé dehors.

**Solution :** `BufferAttribute.addUpdateRange({ start, count })` (Three.js r159+).
On enregistre l'offset de début avant d'écrire les instances, puis on indique à Three.js
de n'uploader **que la portion nouvellement écrite** (quelques Ko au lieu de 22 MB).

```js
const startIndex = nextGrassOffsetRefs.current[qi]
// ... écriture des instances dans le buffer CPU ...
const endIndex = nextGrassOffsetRefs.current[qi]

if (endIndex > startIndex) {
  mesh.instanceMatrix.addUpdateRange({ start: startIndex * 16, count: (endIndex - startIndex) * 16 })
}
mesh.instanceMatrix.needsUpdate = true
```

> `start` et `count` sont en **éléments** (floats), pas en octets.
> Three.js multiplie par `BYTES_PER_ELEMENT` en interne.

**Piège Three.js r175+ — bounding sphere :**
À partir de Three.js r175, le renderer utilise `mesh.boundingSphere` en priorité sur
`geometry.boundingSphere` pour le frustum culling. Lors d'un upload partiel, Three.js
peut recalculer `mesh.boundingSphere` à partir des **nouvelles instances uniquement**,
ce qui donne une sphère trop petite. Résultat : l'herbe disparaît selon l'angle de caméra
(frustum culling incorrect).

**Correction obligatoire :** après chaque `needsUpdate = true`, restaurer explicitement
la bounding sphere du quadrant complet sur le mesh :

```js
mesh.instanceMatrix.needsUpdate = true
// Restaurer la bounding sphere complète du quadrant (pas seulement les nouvelles instances)
const sphere = grassQuadrantSpheresRef.current?.[qi]
if (sphere) mesh.boundingSphere = sphere
```

Les sphères sont précalculées dans le `useMemo` de `grassGeometries` et stockées dans
`grassQuadrantSpheresRef.current`.

**Piège futur :** Si on met à jour Three.js et que l'herbe disparaît selon l'angle caméra,
c'est probablement ce problème de `boundingSphere`. Vérifier que `mesh.boundingSphere`
est bien restauré après chaque écriture.

---

## 4. État React vs refs pour les données réseau haute fréquence

**Fichier :** `src/App.jsx`

**Problème :**
Les états `remotePlayerState` et `remoteBallState` étaient des `useState`. Chaque paquet réseau
(20–40 Hz) déclenchait un `setState`, donc un re-render React de toute l'arborescence.

**Solution :** Remplacés par des `useRef`. Seul `hasRemotePlayer` (booléen) reste en `useState`
car il ne change qu'une fois par session (à l'arrivée/départ du joueur distant).

```js
// ❌ Avant — re-render à chaque paquet réseau
const [remotePlayerState, setRemotePlayerState] = useState(null)

// ✅ Après — zero re-render
const remotePlayerStateRef = useRef(null)
const [hasRemotePlayer, setHasRemotePlayer] = useState(false) // change 1×/session seulement
```

**Piège futur :** Ne jamais mettre en `useState` des données qui arrivent à >5 Hz.
Utiliser des refs et lire les valeurs directement dans `useFrame`.

---

## 5. `React.memo` sur les composants lourds de la scène

**Fichier :** `src/world/OutdoorNeighborhood.jsx`

**Problème :**
`OutdoorNeighborhood` (arbres, maisons, terrain, ciel) se re-rendait à chaque update de
`renderStats` (4×/sec) car il n'était pas mémoisé.

**Solution :** `React.memo(function OutdoorNeighborhood(...) { ... })`.

**Piège futur :** Tout composant R3F lourd qui reçoit des props stables doit être wrappé
dans `React.memo`. Sans ça, n'importe quel `setState` parent le force à se re-rendre
et Three.js doit réconcilier tous ses enfants.

---

## 6. Interpolation Hermite pour le joueur distant (anti-saccades)

**Fichier :** `src/App.jsx` — `function RemotePlayer`

**Problème :** Interpolation linéaire simple entre deux positions réseau → mouvement saccadé
car les vitesses aux extrémités ne sont pas respectées.

**Solution :** Spline cubique de Hermite utilisant la vélocité aux deux points :

```js
const h00 = 2*a3 - 3*a2 + 1  // poids position départ
const h10 = a3 - 2*a2 + alpha  // poids vitesse départ
const h01 = -2*a3 + 3*a2      // poids position arrivée
const h11 = a3 - a2            // poids vitesse arrivée
x = h00*p0.x + h10*v0.x*spanSec + h01*p1.x + h11*v1.x*spanSec
```

Le délai d'interpolation est de 150 ms (`MULTIPLAYER_INTERP_DELAY_MS`) pour maintenir
un buffer de snapshots suffisant côté Colyseus.

**Piège futur :** Ne jamais mettre `position={state.position}` en prop JSX sur le group
du joueur distant — R3F réappliquerait la position à chaque re-render, écrasant
l'interpolation. La position doit être appliquée **uniquement** via `group.position.set()`
dans `useFrame`.
