// Convertit les animations Mixamo du joueur de FBX vers GLB via FBX2glTF.
//
// Pourquoi : les FBX Mixamo pèsent ~2 Mo chacun et sont lents à parser au runtime
// (FBXLoader). FBX2glTF produit des GLB ~5-10x plus légers et préserve l'orientation
// Mixamo (contrairement à un passage par Blender). Côté code, les noms de pistes sont
// renormalisés (mixamorig: -> mixamorig) par cloneMixamoAnimationClip dans App.jsx.
//
// Usage : node scripts/convert-anims-glb.mjs [nom]
//   sans argument : convertit toutes les animations ci-dessous
//   avec un nom (ex. "idle") : ne convertit que celle-là (utile pour un pilote)

import convert from 'fbx2gltf'
import { mkdirSync } from 'node:fs'

const SRC_DIR = 'anim-src' // FBX sources hors public/ (non déployés)
const OUT_DIR = 'public/models/player/anim'

// nom logique de sortie -> fichier FBX source (dans anim-src/)
const ANIMATIONS = {
  idle: 'player-idle.fbx',
  walk: 'player-walk.fbx',
  run: 'player-run.fbx',
  kick: 'player-kick.fbx',
  punch: 'player-punch.fbx',
  waving: 'Waving.fbx',
  dance: 'Wave Hip Hop Dance.fbx',
  'pointing-up': 'pointing-up.fbx',
  'jump-start': 'player-jump-start.fbx',
  'jump-loop': 'player-jump-loop.fbx',
  'jump-land': 'player-jump-land.fbx',
  'stand-to-sit': 'Stand To Sit.fbx',
  'sitting-idle': 'Sitting Idle.fbx',
  'stand-up': 'Stand Up.fbx',
  // Épée « ultra cheat » (pack Great Sword, Mixamo) — arme de mêlée du Boss Slime.
  'sword-slash': 'great-sword-slash.fbx',
  'sword-idle': 'great-sword-idle.fbx',
  'sword-impact': 'great-sword-impact.fbx',
}

mkdirSync(OUT_DIR, { recursive: true })

const only = process.argv[2]
const entries = only ? [[only, ANIMATIONS[only]]] : Object.entries(ANIMATIONS)

for (const [name, file] of entries) {
  if (!file) {
    console.warn(`skip ${name} : inconnu`)
    continue
  }
  const output = `${OUT_DIR}/${name}.glb`
  try {
    await convert(`${SRC_DIR}/${file}`, output, ['--binary', '--keep-attribute', 'auto'])
    console.log(`OK ${file} -> anim/${name}.glb`)
  } catch (err) {
    console.error(`ECHEC ${file}:`, String(err).slice(0, 200))
  }
}
