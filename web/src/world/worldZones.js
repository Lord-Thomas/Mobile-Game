import { OUTDOOR_HALF_SIZE, PLAYER_PLOT_SIZE, ROAD_WIDTH } from './outdoorData'
import { getRoomBounds, houseLayout, mainRoom, outsideDoorOpening } from './house/houseLayout'
import { roadLayout } from './roads/roadLayout'
import { createRoadCurve } from './roads/roadGeometry'
import { getBiomeInfluence } from './biomeAreas'

export const WORLD_ZONES = {
  HOUSE: 'HOUSE',
  ROAD: 'ROAD',
  PATH: 'PATH',
  PLOT_FLAT_AREA: 'PLOT_FLAT_AREA',
  LAWN: 'LAWN',
  WILD_GRASS: 'WILD_GRASS',
  FOREST_EDGE: 'FOREST_EDGE',
  NO_SPAWN: 'NO_SPAWN',
}

const mainRoadCurve = createRoadCurve(roadLayout.mainRoad.points)
const roadSamples = Array.from({ length: 96 }, (_, index) => mainRoadCurve.getPointAt(index / 95))
const mainBounds = getRoomBounds(mainRoom)
const playerPathX = mainBounds.minX - 1.05
const playerPathStartZ = outsideDoorOpening.centerZ
const playerPathEndZ = 20.9

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function distanceToSamples(x, z, samples = roadSamples) {
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
    minDistance = Math.min(minDistance, Math.hypot(x - closestX, z - closestZ))
  }

  return minDistance
}

function isInsideAxisRect(x, z, centerX, centerZ, width, depth, margin = 0) {
  return Math.abs(x - centerX) < width * 0.5 + margin && Math.abs(z - centerZ) < depth * 0.5 + margin
}

export function getDistanceToRoad(x, z) {
  return distanceToSamples(x, z)
}

export function getDistanceToPath(x, z) {
  const vertical = isInsideAxisRect(
    x,
    z,
    playerPathX,
    (playerPathStartZ + playerPathEndZ) * 0.5,
    2.2,
    playerPathEndZ - playerPathStartZ,
    0,
  )
    ? 0
    : Math.hypot(
      Math.max(Math.abs(x - playerPathX) - 1.1, 0),
      Math.max(Math.abs(z - (playerPathStartZ + playerPathEndZ) * 0.5) - (playerPathEndZ - playerPathStartZ) * 0.5, 0),
    )

  const horizontal = isInsideAxisRect(
    x,
    z,
    (playerPathX + mainBounds.minX) * 0.5,
    playerPathStartZ,
    Math.abs(playerPathX - mainBounds.minX),
    2.2,
    0,
  )
    ? 0
    : Math.hypot(
      Math.max(Math.abs(x - (playerPathX + mainBounds.minX) * 0.5) - Math.abs(playerPathX - mainBounds.minX) * 0.5, 0),
      Math.max(Math.abs(z - playerPathStartZ) - 1.1, 0),
    )

  return Math.min(vertical, horizontal)
}

export function isInsideHouseFootprint(x, z, margin = 0) {
  const playerHouse = houseLayout.rooms.some((room) => {
    const bounds = getRoomBounds(room)
    return x > bounds.minX - margin && x < bounds.maxX + margin && z > bounds.minZ - margin && z < bounds.maxZ + margin
  })
  if (playerHouse) return true

  return false
}

export function isInsideAnyPlot(x, z, margin = 0) {
  if (Math.abs(x) < PLAYER_PLOT_SIZE * 0.5 + margin && Math.abs(z) < PLAYER_PLOT_SIZE * 0.5 + margin) return true
  return false
}

export function getZoneAt(x, z) {
  if (Math.abs(x) > OUTDOOR_HALF_SIZE - 1.2 || Math.abs(z) > OUTDOOR_HALF_SIZE - 1.2) return WORLD_ZONES.NO_SPAWN
  if (isInsideHouseFootprint(x, z, 0.9)) return WORLD_ZONES.HOUSE

  const roadDistance = getDistanceToRoad(x, z)
  if (roadDistance < ROAD_WIDTH * 0.5 + 0.9) return WORLD_ZONES.ROAD
  if (getDistanceToPath(x, z) < 0.8) return WORLD_ZONES.PATH
  if (isInsideAnyPlot(x, z, -0.8)) return WORLD_ZONES.LAWN
  if (isInsideAnyPlot(x, z, 1.8)) return WORLD_ZONES.PLOT_FLAT_AREA
  if (Math.max(Math.abs(x), Math.abs(z)) > OUTDOOR_HALF_SIZE * 0.72) return WORLD_ZONES.FOREST_EDGE
  return WORLD_ZONES.WILD_GRASS
}

export function getZoneDensity(type, x, z) {
  const zone = getZoneAt(x, z)
  const roadDistance = getDistanceToRoad(x, z)
  const pathDistance = getDistanceToPath(x, z)
  const graveyardInfluence = getBiomeInfluence('graveyard', x, z, null)
  const livingCoverMultiplier = Math.pow(1 - graveyardInfluence, 3.5)

  if (type === 'lawn_blade') {
    if ([WORLD_ZONES.HOUSE, WORLD_ZONES.ROAD, WORLD_ZONES.PATH, WORLD_ZONES.NO_SPAWN].includes(zone)) return 0
    const plotEdge = PLAYER_PLOT_SIZE * 0.5
    const distanceInsidePlot = plotEdge - Math.max(Math.abs(x), Math.abs(z))
    const distanceOutsidePlot = Math.max(Math.abs(x), Math.abs(z)) - plotEdge
    const plotCore = smoothstep(-2.4, 4.2, distanceInsidePlot)
    const plotFeather = 1 - smoothstep(1.8, 8.5, distanceOutsidePlot)
    const pathFade = smoothstep(0.55, 3.8, pathDistance)
    const roadFade = smoothstep(ROAD_WIDTH * 0.5 + 1.6, ROAD_WIDTH * 0.5 + 4.0, roadDistance)
    const base = zone === WORLD_ZONES.LAWN
      ? 0.58
      : zone === WORLD_ZONES.PLOT_FLAT_AREA
        ? 0.3
        : 0.14
    return base * Math.max(plotCore, plotFeather * 0.65) * pathFade * roadFade * livingCoverMultiplier
  }

  if (type === 'tall_grass') {
    if (zone === WORLD_ZONES.FOREST_EDGE) return 0.78 * livingCoverMultiplier
    if (zone === WORLD_ZONES.WILD_GRASS) return 0.42 * smoothstep(ROAD_WIDTH * 0.5 + 1.8, ROAD_WIDTH * 0.5 + 4.5, roadDistance) * livingCoverMultiplier
    if (zone === WORLD_ZONES.PLOT_FLAT_AREA) return 0.12 * livingCoverMultiplier
    return 0
  }

  if (type === 'rock') {
    if (zone === WORLD_ZONES.FOREST_EDGE) return 0.16
    if (zone === WORLD_ZONES.WILD_GRASS) return 0.08
    if (zone === WORLD_ZONES.PLOT_FLAT_AREA && pathDistance > 1.8) return 0.04
    return 0
  }

  return 0
}

export function canPlaceObject(type, x, z) {
  const zone = getZoneAt(x, z)
  if ([WORLD_ZONES.NO_SPAWN, WORLD_ZONES.HOUSE, WORLD_ZONES.ROAD, WORLD_ZONES.PATH].includes(zone)) return false

  if (type === 'authored_tree') {
    return [WORLD_ZONES.LAWN, WORLD_ZONES.PLOT_FLAT_AREA, WORLD_ZONES.WILD_GRASS, WORLD_ZONES.FOREST_EDGE].includes(zone)
      && getDistanceToPath(x, z) > 2
      && getDistanceToRoad(x, z) > ROAD_WIDTH * 0.5 + 2.4
  }

  if (type === 'lawn_blade') return zone === WORLD_ZONES.LAWN && getDistanceToPath(x, z) > 0.9
  if (type === 'tall_grass') return getZoneDensity(type, x, z) > 0 && getDistanceToPath(x, z) > 1.4
  if (type === 'rock') return getZoneDensity(type, x, z) > 0 && getDistanceToPath(x, z) > 1.2

  return false
}

export function getForestInfluence() {
  return 0
}
