import { BufferGeometry, Float32BufferAttribute } from 'three'
import { getRoomBounds, houseLayout } from '../house/houseLayout'
import { OUTDOOR_WORLD_SIZE, PLAYER_PLOT_SIZE, ROAD_WIDTH } from '../outdoorData'
import { roadLayout } from '../roads/roadLayout'
import { createRoadCurve } from '../roads/roadGeometry'

export const TERRAIN_COLLIDER_SEGMENTS = 96
export const TERRAIN_VISUAL_SEGMENTS = 176
export const TERRAIN_COLLIDER_SIZE = OUTDOOR_WORLD_SIZE
export const TERRAIN_VISUAL_SIZE = 188
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
    plotTransition: 5,
    pathTransition: 1.8,
  },
  border: {
    start: 0.68,
    end: 1,
  },
}

const ROAD_HEIGHT = -0.035
const PLAYER_PLOT_HEIGHT = 0.018
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
  const playableBlend = smoothstep(15, 30, maxAxis)
  const borderBlend = smoothstep(
    OUTDOOR_WORLD_SIZE * 0.5 * terrainSettings.border.start,
    OUTDOOR_WORLD_SIZE * 0.5 * terrainSettings.border.end,
    maxAxis,
  )
  const distantBlend = smoothstep(42, 88, maxAxis)
  const mountainMask = smoothstep(58, 92, maxAxis)
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

function getHouseCutMask(x, z) {
  const playerHouseMask = houseLayout.rooms.reduce((maxMask, room) => {
    const bounds = getRoomBounds(room)
    const width = bounds.maxX - bounds.minX
    const depth = bounds.maxZ - bounds.minZ
    return Math.max(maxMask, softRectMask(x, z, [room.position[0], 0, room.position[2]], [width + 0.5, depth + 0.5], 0, 0.45))
  }, 0)

  return playerHouseMask
}

export function getTerrainHeight(x, z) {
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

  const playerPlotMask = softRectMask(x, z, [0, 0, 0], [PLAYER_PLOT_SIZE, PLAYER_PLOT_SIZE], 0, terrainSettings.flatten.plotTransition)
  height = mix(height, PLAYER_PLOT_HEIGHT, playerPlotMask)

  const playerPathMask = getPlayerPathMask(x, z)
  height = mix(height, PATH_HEIGHT, playerPathMask)

  const neighborPathMask = getNeighborPathMask(x, z)
  height = mix(height, PATH_HEIGHT, neighborPathMask)

  const houseCutMask = getHouseCutMask(x, z)
  height = mix(height, HOUSE_CUT_HEIGHT, houseCutMask)

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
