import { BufferGeometry, Float32BufferAttribute } from 'three'
import { getRoomBounds, houseLayout } from '../house/houseLayout'
import { localHousePointToWorld } from '../house/houseTransforms'
import { getNeighborHouseParts, NEIGHBOR_HOUSES, OUTDOOR_WORLD_SIZE, ROAD_WIDTH } from '../outdoorData'
import { roadLayout } from '../roads/roadLayout'
import { createRoadCurve } from '../roads/roadGeometry'

export const MODIFICATION_GRID_SPACING = 1.0

// Rempli de façon asynchrone depuis public/terrain/modifications.bin (voir terrainReady),
// en remplacement de l'ancien import statique de terrainModifications.generated.js
// (~3,1 Mo de texte JS parsé au boot → ~1,1 Mo de binaire lu en quasi-instantané).
// Même approche que mapObjectCollisionData.js.
// Référence STABLE : l'éditeur (src/tools/Editor.jsx) mute cet objet EN PLACE
// (delete / Object.assign / affectations). Ne jamais le réassigner.
export const terrainModifications = {}

// Format du .bin (voir scripts/encode-terrain-bin.mjs) :
//   [0..4) header uint32 = N ; puis xs(Int32×N) | zs(Int32×N) | vals(Float32×N)
// Anti-cache : en dev, une version unique à chaque chargement garantit qu'une édition
// de terrain est toujours relue (le navigateur ne sert jamais un ancien .bin). En prod,
// une version figée par build (__TERRAIN_BIN_BUILD__, défini dans vite.config.js) garde
// un cache normal mais le rafraîchit à chaque déploiement.
const TERRAIN_BIN_VERSION = import.meta.env.DEV ? Date.now() : __TERRAIN_BIN_BUILD__

async function loadTerrainModifications() {
  try {
    const response = await fetch(`/terrain/modifications.bin?v=${TERRAIN_BIN_VERSION}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const buffer = await response.arrayBuffer()
    const N = new Uint32Array(buffer, 0, 1)[0]
    let offset = 4
    const xs = new Int32Array(buffer, offset, N)
    offset += N * 4
    const zs = new Int32Array(buffer, offset, N)
    offset += N * 4
    const vals = new Float32Array(buffer, offset, N)
    for (let i = 0; i < N; i += 1) {
      terrainModifications[`${xs[i]}_${zs[i]}`] = vals[i]
    }
  } catch (error) {
    console.warn('Modifications de terrain non chargées (terrain plat)', error)
  }
}

// Le fetch démarre dès l'import du module. main.jsx attend terrainReady AVANT de
// rendre l'app, pour qu'aucune géométrie de terrain ne soit construite (et mise en
// cache) sur des données vides.
export const terrainReady = loadTerrainModifications()

export function getTerrainModificationOffset(x, z) {
  const spacing = MODIFICATION_GRID_SPACING
  const xFloor = Math.floor(x / spacing)
  const zFloor = Math.floor(z / spacing)
  const xCeil = xFloor + 1
  const zCeil = zFloor + 1

  const tx = (x / spacing) - xFloor
  const tz = (z / spacing) - zFloor

  const h00 = terrainModifications[`${xFloor}_${zFloor}`] || 0
  const h10 = terrainModifications[`${xCeil}_${zFloor}`] || 0
  const h01 = terrainModifications[`${xFloor}_${zCeil}`] || 0
  const h11 = terrainModifications[`${xCeil}_${zCeil}`] || 0

  const h0 = h00 * (1 - tx) + h10 * tx
  const h1 = h01 * (1 - tx) + h11 * tx

  return h0 * (1 - tz) + h1 * tz
}

export const TERRAIN_COLLIDER_SEGMENTS = 192
export const TERRAIN_VISUAL_SEGMENTS = 256
export const TERRAIN_COLLIDER_SIZE = OUTDOOR_WORLD_SIZE
export const TERRAIN_VISUAL_SIZE = 376
export const TERRAIN_HALF_SIZE = TERRAIN_VISUAL_SIZE * 0.5

const terrainSettings = {
  height: {
    playableMultiplier: 0.35,
    gardenMultiplier: 0.58,
    borderMultiplier: 1.45,
    borderLift: 0.9,
    distantMultiplier: 2.1,
    distantLift: 1.7,
    mountainLift: 3.2,
  },
  noise: {
    macroScale: 0.012,
    macroAmplitude: 1.25,
    mediumScale: 0.038,
    mediumAmplitude: 0.5,
    detailScale: 0.11,
    detailAmplitude: 0.1,
  },
  flatten: {
    roadFlatMargin: 0.8,
    roadTransition: 3.6,
    pathTransition: 1.8,
  },
  border: {
    start: 0.68,
    end: 1,
  },
}

const ROAD_HEIGHT = -0.035
const PATH_HEIGHT = 0.012
const HOUSE_CUT_HEIGHT = -0.16

const mainRoadCurve = createRoadCurve(roadLayout.mainRoad.points)
const roadSamples = Array.from({ length: 96 }, (_, index) => {
  const t = index / 95
  return mainRoadCurve.getPointAt(t)
})

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function mix(a, b, t) {
  return a + (b - a) * t
}

function softBandMask(distance, inner, outer) {
  return 1 - smoothstep(inner, outer, distance)
}

function layeredWaveNoise(x, z, scale) {
  return (
    Math.sin(x * scale + z * scale * 0.47) * 0.5 +
    Math.sin(x * scale * -0.63 + z * scale * 1.31) * 0.32 +
    Math.sin((x + z) * scale * 0.72) * 0.18
  )
}

function naturalHeight(x, z) {
  const maxAxis = Math.max(Math.abs(x), Math.abs(z))
  const playableBlend = smoothstep(45, 120, maxAxis)
  const borderBlend = smoothstep(
    OUTDOOR_WORLD_SIZE * 0.5 * terrainSettings.border.start,
    OUTDOOR_WORLD_SIZE * 0.5 * terrainSettings.border.end,
    maxAxis,
  )
  const distantBlend = smoothstep(118, 184, maxAxis)
  const mountainMask = smoothstep(136, 188, maxAxis)
  const ridgeNoise = Math.max(
    0,
    layeredWaveNoise(x - 17.8, z + 31.4, 0.024) * 0.72 +
      layeredWaveNoise(x + 46.2, z - 9.1, 0.041) * 0.28,
  )
  const reliefMultiplier = mix(
    mix(
      mix(terrainSettings.height.playableMultiplier, terrainSettings.height.gardenMultiplier, playableBlend),
      terrainSettings.height.borderMultiplier,
      borderBlend,
    ),
    terrainSettings.height.distantMultiplier,
    distantBlend,
  )
  const noiseHeight =
    layeredWaveNoise(x, z, terrainSettings.noise.macroScale) * terrainSettings.noise.macroAmplitude +
    layeredWaveNoise(x + 19.3, z - 11.7, terrainSettings.noise.mediumScale) * terrainSettings.noise.mediumAmplitude +
    layeredWaveNoise(x - 7.5, z + 23.1, terrainSettings.noise.detailScale) * terrainSettings.noise.detailAmplitude
  const borderLift = borderBlend * borderBlend * terrainSettings.height.borderLift
  const distantLift = distantBlend * distantBlend * terrainSettings.height.distantLift
  const mountainLift = ridgeNoise * mountainMask * terrainSettings.height.mountainLift

  return noiseHeight * reliefMultiplier + borderLift + distantLift + mountainLift
}

function distanceToPolylineSamples(x, z, samples) {
  let minDistance = Infinity

  for (let index = 0; index < samples.length - 1; index += 1) {
    const a = samples[index]
    const b = samples[index + 1]
    const abX = b.x - a.x
    const abZ = b.z - a.z
    const apX = x - a.x
    const apZ = z - a.z
    const lengthSq = abX * abX + abZ * abZ
    const t = lengthSq > 0 ? clamp01((apX * abX + apZ * abZ) / lengthSq) : 0
    const closestX = a.x + abX * t
    const closestZ = a.z + abZ * t
    const dx = x - closestX
    const dz = z - closestZ
    minDistance = Math.min(minDistance, Math.hypot(dx, dz))
  }

  return minDistance
}

function softRectMask(x, z, center, size, rotationY = 0, falloff = 1.8) {
  const dx = x - center[0]
  const dz = z - center[2]
  const cos = Math.cos(-rotationY)
  const sin = Math.sin(-rotationY)
  const localX = dx * cos - dz * sin
  const localZ = dx * sin + dz * cos
  const outsideX = Math.max(Math.abs(localX) - size[0] * 0.5, 0)
  const outsideZ = Math.max(Math.abs(localZ) - size[1] * 0.5, 0)
  const outsideDistance = Math.hypot(outsideX, outsideZ)
  return 1 - smoothstep(0, falloff, outsideDistance)
}

function getPlayerPathMask(x, z) {
  const mainRoom = houseLayout.rooms.find((room) => room.id === 'main_room')
  const mainBounds = getRoomBounds(mainRoom)
  const pathX = mainBounds.minX - 1.05
  const pathStartZ = -2.25
  const pathEndZ = 20.9
  const vertical = softRectMask(
    x,
    z,
    [pathX, 0, (pathStartZ + pathEndZ) * 0.5],
    [3.2, pathEndZ - pathStartZ],
    0,
    terrainSettings.flatten.pathTransition,
  )
  const horizontal = softRectMask(
    x,
    z,
    [(pathX + mainBounds.minX) * 0.5, 0, pathStartZ],
    [Math.abs(pathX - mainBounds.minX), 2.4],
    0,
    terrainSettings.flatten.pathTransition,
  )

  return Math.max(vertical, horizontal)
}

function getNeighborPathMask() {
  return 0
}

// La map naturelle ne contient aucune empreinte de maison. C'est uniquement la
// construction active qui fournit ses rectangles et terrasse le sol sous elle.
let playerHouseFootprintRects = []

function getFootprintSignature(rects) {
  return rects.map((rect) => `${rect.minX},${rect.minZ},${rect.maxX},${rect.maxZ}`).sort().join(';')
}

function getFootprintBounds(rects) {
  return rects.reduce((bounds, rect) => ({
    minX: Math.min(bounds.minX, rect.minX),
    maxX: Math.max(bounds.maxX, rect.maxX),
    minZ: Math.min(bounds.minZ, rect.minZ),
    maxZ: Math.max(bounds.maxZ, rect.maxZ),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity })
}

// Aligne la découpe du terrain sur l'empreinte du plan et rafraîchit la
// géométrie visuelle localement (ancienne + nouvelle zone, marge de fondu).
export function syncPlayerHouseTerrainFootprint(rects) {
  if (!Array.isArray(rects)) return
  if (getFootprintSignature(rects) === getFootprintSignature(playerHouseFootprintRects)) return

  const previousBounds = getFootprintBounds(playerHouseFootprintRects)
  playerHouseFootprintRects = rects.map((rect) => ({ ...rect }))
  const nextBounds = getFootprintBounds(playerHouseFootprintRects)
  const margin = 4
  updateCachedVisualGeometryHeights({
    minX: Math.min(previousBounds.minX, nextBounds.minX) - margin,
    maxX: Math.max(previousBounds.maxX, nextBounds.maxX) + margin,
    minZ: Math.min(previousBounds.minZ, nextBounds.minZ) - margin,
    maxZ: Math.max(previousBounds.maxZ, nextBounds.maxZ) + margin,
  })
}

function getHouseCutMask(x, z) {
  return playerHouseFootprintRects.reduce((maxMask, rect) => {
    const width = rect.maxX - rect.minX
    const depth = rect.maxZ - rect.minZ
    const centerX = (rect.minX + rect.maxX) * 0.5
    const centerZ = (rect.minZ + rect.maxZ) * 0.5
    return Math.max(maxMask, softRectMask(x, z, [centerX, 0, centerZ], [width + 0.5, depth + 0.5], 0, 0.45))
  }, 0)
}

function getNeighborHousePadHeight(house) {
  return naturalHeight(house.position[0], house.position[2])
}

function getNeighborHousePadHeightAt(x, z) {
  let strongestMask = 0
  let targetHeight = 0

  NEIGHBOR_HOUSES.forEach((house) => {
    getNeighborHouseParts(house).forEach((part) => {
      const worldCenter = localHousePointToWorld(
        house.position[0],
        house.position[2],
        house.rotationY,
        part.offset[0],
        part.offset[1],
      )
      const center = [
        worldCenter.x,
        0,
        worldCenter.z,
      ]
      const mask = softRectMask(
        x,
        z,
        center,
        [part.size[0] + 1.4, part.size[2] + 1.4],
        house.rotationY,
        2.4,
      )

      if (mask > strongestMask) {
        strongestMask = mask
        targetHeight = getNeighborHousePadHeight(house)
      }
    })
  })

  return { mask: strongestMask, targetHeight }
}

export function getTerrainHeight(x, z, ignoreModifications = false) {
  let height = naturalHeight(x, z)

  const roadDistance = distanceToPolylineSamples(x, z, roadSamples)
  const roadMask = softBandMask(
    roadDistance,
    ROAD_WIDTH * 0.5 + terrainSettings.flatten.roadFlatMargin,
    ROAD_WIDTH * 0.5 + terrainSettings.flatten.roadFlatMargin + terrainSettings.flatten.roadTransition,
  )
  const shoulderMask = softBandMask(
    roadDistance,
    ROAD_WIDTH * 0.5 + 1.4,
    ROAD_WIDTH * 0.5 + terrainSettings.flatten.roadFlatMargin + terrainSettings.flatten.roadTransition + 1.4,
  )
  const innerRoadMask = softBandMask(roadDistance, ROAD_WIDTH * 0.5 - 0.08, ROAD_WIDTH * 0.5 + 0.45)
  height = mix(height, 0.018, shoulderMask * (1 - innerRoadMask) * 0.55)
  height = mix(height, ROAD_HEIGHT, roadMask)

  const playerPathMask = getPlayerPathMask(x, z)
  height = mix(height, PATH_HEIGHT, playerPathMask)

  const neighborPathMask = getNeighborPathMask(x, z)
  height = mix(height, PATH_HEIGHT, neighborPathMask)

  const houseCutMask = getHouseCutMask(x, z)
  height = mix(height, HOUSE_CUT_HEIGHT, houseCutMask)

  const neighborPad = getNeighborHousePadHeightAt(x, z)
  height = mix(height, neighborPad.targetHeight, neighborPad.mask * (1 - roadMask))

  if (!ignoreModifications) {
    const modOffset = getTerrainModificationOffset(x, z)
    // Damp/prevent modification under the house bounds to avoid floor clipping
    height += modOffset * (1 - houseCutMask)
  }

  return height
}

export function getHeightfieldArgs(terrain) {
  return [
    terrain.segments,
    terrain.segments,
    terrain.heights,
    { x: terrain.size, y: 1, z: terrain.size },
  ]
}

export function createTerrainGeometry({
  size = TERRAIN_VISUAL_SIZE,
  segments = TERRAIN_VISUAL_SEGMENTS,
} = {}) {
  const positions = []
  const uvs = []
  const indices = []
  const heights = []
  const halfSize = size * 0.5
  const step = size / segments

  for (let zIndex = 0; zIndex <= segments; zIndex += 1) {
    const z = -halfSize + zIndex * step
    for (let xIndex = 0; xIndex <= segments; xIndex += 1) {
      const x = -halfSize + xIndex * step
      const y = getTerrainHeight(x, z)
      positions.push(x, y, z)
      uvs.push(xIndex / segments, zIndex / segments)
      heights.push(y)
    }
  }

  for (let zIndex = 0; zIndex < segments; zIndex += 1) {
    for (let xIndex = 0; xIndex < segments; xIndex += 1) {
      const a = zIndex * (segments + 1) + xIndex
      const b = a + 1
      const c = a + segments + 1
      const d = c + 1
      indices.push(a, c, b)
      indices.push(b, c, d)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  return {
    geometry,
    heights,
    segments,
    size,
    vertices: new Float32Array(positions),
    indices: new Uint32Array(indices),
  }
}

let cachedVisualGeometry = null

export function getCachedVisualGeometry() {
  if (!cachedVisualGeometry) {
    cachedVisualGeometry = createTerrainGeometry()
  }
  return cachedVisualGeometry
}

export function updateCachedVisualGeometryHeights(bounds = null) {
  const terrain = cachedVisualGeometry
  if (!terrain) return

  const positions = terrain.geometry.attributes.position.array
  const segments = terrain.segments
  const size = terrain.size
  const halfSize = size * 0.5
  const step = size / segments
  const minXIndex = bounds
    ? Math.max(0, Math.floor((bounds.minX + halfSize) / step) - 2)
    : 0
  const maxXIndex = bounds
    ? Math.min(segments, Math.ceil((bounds.maxX + halfSize) / step) + 2)
    : segments
  const minZIndex = bounds
    ? Math.max(0, Math.floor((bounds.minZ + halfSize) / step) - 2)
    : 0
  const maxZIndex = bounds
    ? Math.min(segments, Math.ceil((bounds.maxZ + halfSize) / step) + 2)
    : segments

  for (let zIndex = minZIndex; zIndex <= maxZIndex; zIndex += 1) {
    const z = -halfSize + zIndex * step
    for (let xIndex = minXIndex; xIndex <= maxXIndex; xIndex += 1) {
      const x = -halfSize + xIndex * step
      const y = getTerrainHeight(x, z)
      const vertexIndex = zIndex * (segments + 1) + xIndex
      positions[vertexIndex * 3 + 1] = y // Update Y component
      terrain.heights[vertexIndex] = y // Keep heights array in sync
      terrain.vertices[vertexIndex * 3 + 1] = y
    }
  }

  terrain.geometry.attributes.position.needsUpdate = true
  terrain.geometry.computeVertexNormals()
}
