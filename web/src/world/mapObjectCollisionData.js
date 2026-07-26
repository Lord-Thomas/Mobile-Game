// Chargement des données de collision en binaire (voir scripts/encode-collision-bin.mjs).
//
// Remplace l'ancien import statique de mapObjectCollisionData.generated.js (~9,8 Mo de
// JS à parser au boot). Ici on fetch un .bin (~1,5 Mo) décodé en vues typées : pas de
// parsing texte→float, pas de compilation JS. Le fetch démarre dès l'import du module
// (donc pendant l'écran de chargement) ; collisionReady permet à l'écran de chargement
// d'attendre que ce soit prêt avant de laisser jouer → aucun pop-in ni freeze au spawn.

// objectId → URL du .bin (servi depuis public/).
const COLLISION_BIN_URLS = {
  skeleton_tower: '/collision/skeleton_tower.bin',
  summoning_altar: '/collision/summoning_altar.bin',
}

// objectId → source { vertices, indices, walkTriangles, solidTriangles } (vues typées).
// Référence STABLE par objet (le collisionCache amont est un WeakMap keyé dessus).
const sources = {}
let sourcesVersion = 0

function parseCollisionBin(buffer) {
  const header = new Uint32Array(buffer, 0, 4)
  const [vLen, iLen, wLen, sLen] = header
  let offset = header.byteLength
  const vertices = new Float32Array(buffer, offset, vLen)
  offset += vLen * 4
  const indices = new Uint32Array(buffer, offset, iLen)
  offset += iLen * 4
  const walkTriangles = new Float32Array(buffer, offset, wLen)
  offset += wLen * 4
  const solidTriangles = new Float32Array(buffer, offset, sLen)
  return { vertices, indices, walkTriangles, solidTriangles }
}

async function loadOne(objectId, url) {
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    sources[objectId] = parseCollisionBin(await response.arrayBuffer())
    sourcesVersion += 1
  } catch (error) {
    console.warn(`Collision binaire non chargée (${objectId})`, error)
  }
}

// Démarre tous les chargements immédiatement, à l'import du module.
export const collisionReady = Promise.all(
  Object.entries(COLLISION_BIN_URLS).map(([objectId, url]) => loadOne(objectId, url)),
)

// Source synchrone (null tant que le .bin n'est pas chargé).
export function getMapObjectCollisionSource(objectId) {
  return sources[objectId] ?? null
}

export function getMapObjectCollisionVersion() {
  return sourcesVersion
}
