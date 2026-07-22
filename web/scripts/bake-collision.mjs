// Bake les données de collision (.bin) d'un objet de map à partir de son GLB.
//
// Classe chaque triangle du modèle en :
//   - walkTriangles : normale orientée vers le haut (|ny| >= WALK_MIN_NORMAL_Y) → surface
//     sur laquelle le joueur peut se tenir (le contrôleur lit getOutdoorWalkableHeight).
//   - solidTriangles : le reste (parois ~verticales) → bloque le déplacement horizontal
//     (collidesWithMapObjectSolid) pour qu'on ne traverse plus l'objet.
// Émet aussi le trimesh (vertices/indices) utilisé par le collider Rapier
// (MapObjectPhysicsColliders). Le runtime (mapObjectCollision.js/buildCache) re-normalise
// et met à l'échelle selon targetHeightMeters du catalogue — on livre donc la géométrie
// brute (espace monde du modèle), pas normalisée.
//
// Parseur GLB natif (glTF 2.0 non compressé), zéro dépendance : lit le chunk JSON + le
// chunk BIN, applique les transforms de la hiérarchie de nœuds, extrait les triangles.
// (Ne gère pas Draco/meshopt — les modèles de map sont livrés non compressés.)
//
// Format .bin identique à encode-collision-bin.mjs (little-endian) :
//   [0..16) header : 4 × uint32 = longueurs de [vertices, indices, walkTriangles, solidTriangles]
//   puis vertices (Float32) | indices (Uint32) | walkTriangles (Float32) | solidTriangles (Float32)
// Chaque triangle walk/solid = 12 floats : ax,ay,az, bx,by,bz, cx,cy,cz, nx,ny,nz.
//
// Usage :
//   node scripts/bake-collision.mjs <objectId> <glbPath>
//   ex. node scripts/bake-collision.mjs summoning_altar public/models/map/summoning_altar/model.glb

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const [, , objectId, glbPath] = process.argv
if (!objectId || !glbPath) {
  console.error('Usage: node scripts/bake-collision.mjs <objectId> <glbPath>')
  process.exit(1)
}

// cos(60°) : un triangle dont la normale pointe suffisamment vers le haut est « marchable ».
const WALK_MIN_NORMAL_Y = 0.5

// --- Décodage du conteneur GLB -------------------------------------------------
const buf = readFileSync(glbPath)
if (buf.toString('utf8', 0, 4) !== 'glTF') throw new Error('Pas un fichier GLB')
const jsonLen = buf.readUInt32LE(12)
const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen))
// Chunk BIN juste après le chunk JSON (header de chunk = 8 octets).
const binChunkStart = 20 + jsonLen
const binDataStart = binChunkStart + 8
const bin = buf.subarray(binDataStart)

const COMPONENT = {
  5120: { array: Int8Array, size: 1 },
  5121: { array: Uint8Array, size: 1 },
  5122: { array: Int16Array, size: 2 },
  5123: { array: Uint16Array, size: 2 },
  5125: { array: Uint32Array, size: 4 },
  5126: { array: Float32Array, size: 4 },
}
const TYPE_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }

function readAccessor(index) {
  const acc = json.accessors[index]
  const view = json.bufferViews[acc.bufferView]
  const comp = COMPONENT[acc.componentType]
  const numComponents = TYPE_COUNT[acc.type]
  const byteOffset = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0)
  const stride = view.byteStride ?? comp.size * numComponents
  const out = new Float64Array(acc.count * numComponents)

  for (let i = 0; i < acc.count; i += 1) {
    const elementStart = binDataStart + byteOffset + i * stride
    const typed = new comp.array(buf.buffer, buf.byteOffset + elementStart, numComponents)
    for (let c = 0; c < numComponents; c += 1) out[i * numComponents + c] = typed[c]
  }
  return { data: out, count: acc.count, numComponents }
}

// --- Matrices 4x4 column-major -------------------------------------------------
function multiply(a, b) {
  const m = new Array(16)
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      m[col * 4 + row] =
        a[row] * b[col * 4] +
        a[row + 4] * b[col * 4 + 1] +
        a[row + 8] * b[col * 4 + 2] +
        a[row + 12] * b[col * 4 + 3]
    }
  }
  return m
}

function composeTRS(node) {
  if (node.matrix) return node.matrix.slice()
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz
  const xx = qx * x2, xy = qx * y2, xz = qx * z2
  const yy = qy * y2, yz = qy * z2, zz = qz * z2
  const wx = qw * x2, wy = qw * y2, wz = qw * z2
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]
}

function transformPoint(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ]
}

// --- Extraction des triangles en espace monde ----------------------------------
const vertices = [] // trimesh Rapier
const indices = []
const walkTriangles = []
const solidTriangles = []

function emitTriangle(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
  let nx = uy * vz - uz * vy
  let ny = uz * vx - ux * vz
  let nz = ux * vy - uy * vx
  const len = Math.hypot(nx, ny, nz) || 1
  nx /= len; ny /= len; nz /= len

  const base = vertices.length / 3
  vertices.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
  indices.push(base, base + 1, base + 2)

  const tri = [a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], nx, ny, nz]
  if (Math.abs(ny) >= WALK_MIN_NORMAL_Y) walkTriangles.push(...tri)
  else solidTriangles.push(...tri)
}

function processMesh(meshIndex, world) {
  const mesh = json.meshes[meshIndex]
  for (const prim of mesh.primitives) {
    if (prim.attributes.POSITION === undefined) continue
    const pos = readAccessor(prim.attributes.POSITION)
    const idx = prim.indices !== undefined ? readAccessor(prim.indices).data : null
    const triCount = idx ? idx.length : pos.count
    const at = (i) => {
      const v = idx ? idx[i] : i
      const p = transformPoint(world, pos.data[v * 3], pos.data[v * 3 + 1], pos.data[v * 3 + 2])
      return p
    }
    for (let i = 0; i + 2 < triCount; i += 3) emitTriangle(at(i), at(i + 1), at(i + 2))
  }
}

function walkNode(nodeIndex, parentMatrix) {
  const node = json.nodes[nodeIndex]
  const world = multiply(parentMatrix, composeTRS(node))
  if (node.mesh !== undefined) processMesh(node.mesh, world)
  for (const child of node.children ?? []) walkNode(child, world)
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const scene = json.scenes?.[json.scene ?? 0]
const rootNodes = scene?.nodes ?? json.nodes.map((_, i) => i)
for (const nodeIndex of rootNodes) walkNode(nodeIndex, IDENTITY)

if (vertices.length === 0) {
  console.error(`Aucune géométrie trouvée dans ${glbPath}`)
  process.exit(1)
}

// --- Écriture du .bin ----------------------------------------------------------
const vArr = Float32Array.from(vertices)
const iArr = Uint32Array.from(indices)
const wArr = Float32Array.from(walkTriangles)
const sArr = Float32Array.from(solidTriangles)

const header = Uint32Array.from([vArr.length, iArr.length, wArr.length, sArr.length])
const bytes = header.byteLength + vArr.byteLength + iArr.byteLength + wArr.byteLength + sArr.byteLength
const outBuffer = new Uint8Array(bytes)
let offset = 0
const put = (typed) => {
  outBuffer.set(new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength), offset)
  offset += typed.byteLength
}
put(header); put(vArr); put(iArr); put(wArr); put(sArr)

const out = join('public', 'collision', `${objectId}.bin`)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, outBuffer)
console.log(
  `${out}  ${(bytes / 1048576).toFixed(3)} Mo  ` +
  `(triangles ${iArr.length / 3}, walk ${wArr.length / 12}, solid ${sArr.length / 12})`,
)
