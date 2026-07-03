// Convertit le modèle d'ailes du sort « Envol Céleste » de FBX vers GLB via
// FBX2glTF — même pipeline que les ennemis (cf. scripts/convert-enemies-glb.mjs).
//
// Source hors public/ (models-src/, non déployé), sortie dans public/models/props/.
// Comme pour les modèles (et contrairement aux anims), PAS de `--keep-attribute
// auto` : ce flag supprimerait l'attribut NORMAL (rendu facetté).
//
// Usage : node scripts/convert-wings-glb.mjs

import convert from 'fbx2gltf'
import { mkdirSync } from 'node:fs'

mkdirSync('public/models/props', { recursive: true })

const src = 'models-src/angel-wings.fbx'
const out = 'public/models/props/angel-wings.glb'

try {
  await convert(src, out, ['--binary', '--compute-normals', 'missing'])
  console.log(`OK ${src} -> ${out}`)
} catch (err) {
  console.error(`ECHEC ${src}:`, String(err).slice(0, 250))
  process.exitCode = 1
}
