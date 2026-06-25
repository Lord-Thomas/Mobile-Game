// Encode les modifications de terrain (terrainModifications.generated.js) en binaire.
//
// Pourquoi : le .generated.js stocke ~94k entrées "x_z": hauteur en TEXTE
// → ~3,1 Mo à télécharger ET à parser comme du code JS au démarrage (coûteux,
// persiste en prod). Le binaire (Int32 coords + Float32 hauteurs) fait ~1,1 Mo et
// se lit en quasi-instantané (pas de parsing texte→float, pas de compilation JS).
// Chargé via fetch pendant l'écran de chargement (cf. terrainReady) → aucun impact
// sur le temps de spawn.
//
// Même approche que scripts/encode-collision-bin.mjs.
//
// Format du .bin (little-endian) :
//   [0..4)   header : 1 × uint32 = N (nombre d'entrées)
//   ensuite  xs (Int32 × N) | zs (Int32 × N) | vals (Float32 × N)
// Toutes les sections sont des multiples de 4 octets → vues typées alignées au décodage.
//
// Usage : node scripts/encode-terrain-bin.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const OUT = 'public/terrain/modifications.bin'

const { MAP_TERRAIN_MODIFICATIONS } = await import('../src/world/terrain/terrainModifications.generated.js')

const keys = Object.keys(MAP_TERRAIN_MODIFICATIONS)
const N = keys.length

const xs = new Int32Array(N)
const zs = new Int32Array(N)
const vals = new Float32Array(N)

keys.forEach((key, i) => {
  const sep = key.indexOf('_')
  const x = Number(key.slice(0, sep))
  const z = Number(key.slice(sep + 1))
  if (!Number.isInteger(x) || !Number.isInteger(z)) {
    throw new Error(`Clé terrain inattendue (x_z entiers attendus) : "${key}"`)
  }
  xs[i] = x
  zs[i] = z
  vals[i] = MAP_TERRAIN_MODIFICATIONS[key]
})

const header = Uint32Array.from([N])
const bytes = header.byteLength + xs.byteLength + zs.byteLength + vals.byteLength
const buffer = new Uint8Array(bytes)
let offset = 0
const put = (typed) => {
  buffer.set(new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength), offset)
  offset += typed.byteLength
}
put(header)
put(xs)
put(zs)
put(vals)

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, buffer)
console.log(`${OUT}  ${(bytes / 1048576).toFixed(2)} Mo  (${N} entrées)`)
