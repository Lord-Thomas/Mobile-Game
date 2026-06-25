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

const OUT_DIR = 'public/models/player/anim'

// nom logique de sortie -> chemin FBX source (relatif à public/, tel qu'utilisé par useFBX)
const ANIMATIONS = {
  idle: 'models/player/player-idle.fbx',
  walk: 'models/player/player-walk.fbx',
  run: 'models/player/player-run.fbx',
  kick: 'models/player/player-kick.fbx',
  punch: 'models/player/player-punch.fbx',
  waving: 'models/Waving.fbx',
  dance: 'models/Wave Hip Hop Dance.fbx',
  'pointing-up': 'models/player/pointing-up.fbx',
  'jump-start': 'models/player/player-jump-start.fbx',
  'jump-loop': 'models/player/player-jump-loop.fbx',
  'jump-land': 'models/player/player-jump-land.fbx',
  'stand-to-sit': 'models/player/Stand To Sit.fbx',
  'sitting-idle': 'models/player/Sitting Idle.fbx',
  'stand-up': 'models/player/Stand Up.fbx',
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
    await convert(`public/${file}`, output, ['--binary', '--keep-attribute', 'auto'])
    console.log(`OK ${file} -> anim/${name}.glb`)
  } catch (err) {
    console.error(`ECHEC ${file}:`, String(err).slice(0, 200))
  }
}
