// Encode les données de collision (mapObjectCollisionData.generated.js) en binaire.
//
// Pourquoi : le .generated.js stocke ~378k nombres en TEXTE (floats type "-2.6368,")
// → ~2,45 Mo à télécharger ET à parser comme du code JS (coûteux, persiste en prod).
// Le binaire Float32/Uint32 fait ~1,5 Mo et se lit en quasi-instantané (pas de
// parsing texte→float, pas de compilation JS). Chargé via fetch pendant l'écran de
// chargement → aucun impact sur les freezes au spawn.
//
// Format du .bin (little-endian) :
//   [0..16)  header : 4 × uint32 = longueurs de [vertices, indices, walkTriangles, solidTriangles]
//   ensuite  vertices (Float32) | indices (Uint32) | walkTriangles (Float32) | solidTriangles (Float32)
// Toutes les longueurs sont des multiples de 4 octets → vues typées alignées au décodage.
//
// Usage : node scripts/encode-collision-bin.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// objectId → export du .generated.js. Ajouter ici si d'autres objets gagnent une collision.
const OBJECTS = {
  skeleton_tower: { export: 'SKELETON_TOWER_COLLISION', out: 'public/collision/skeleton_tower.bin' },
}

const mod = await import('../src/world/mapObjectCollisionData.generated.js')

for (const [objectId, { export: exportName, out }] of Object.entries(OBJECTS)) {
  const src = mod[exportName]
  if (!src) {
    console.warn(`skip ${objectId} : export ${exportName} introuvable`)
    continue
  }

  const vertices = Float32Array.from(src.vertices)
  const indices = Uint32Array.from(src.indices)
  const walkTriangles = Float32Array.from(src.walkTriangles)
  const solidTriangles = Float32Array.from(src.solidTriangles)

  const header = Uint32Array.from([vertices.length, indices.length, walkTriangles.length, solidTriangles.length])
  const bytes = header.byteLength
    + vertices.byteLength + indices.byteLength + walkTriangles.byteLength + solidTriangles.byteLength
  const buffer = new Uint8Array(bytes)
  let offset = 0
  const put = (typed) => {
    buffer.set(new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength), offset)
    offset += typed.byteLength
  }
  put(header)
  put(vertices)
  put(indices)
  put(walkTriangles)
  put(solidTriangles)

  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, buffer)
  console.log(`${out}  ${(bytes / 1048576).toFixed(2)} Mo  (vertices ${vertices.length}, indices ${indices.length}, walk ${walkTriangles.length}, solid ${solidTriangles.length})`)
}
