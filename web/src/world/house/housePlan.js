export const HOUSE_PLAN_VERSION = 1
export const DEFAULT_HOUSE_GRID_SIZE = 1
export const DEFAULT_HOUSE_WALL_THICKNESS = 0.22
export const DEFAULT_HOUSE_WALL_HEIGHT = 5
export const DEFAULT_HOUSE_EXTERIOR_COLOR = '#f3f0e5'
export const DEFAULT_HOUSE_INTERIOR_COLOR = '#e6edf6'
export const HOUSE_ROOM_DIRECTIONS = Object.freeze(['north', 'east', 'south', 'west'])
const MIN_ROOM_SIZE = 3
const MAX_ROOM_SIZE = 14

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

export function getCellKey(x, z) {
  return `${x},${z}`
}

export function parseCellKey(key) {
  const [x, z] = String(key).split(',').map(Number)
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null
}

function createCellsFromRect(minX, minZ, width, depth, data = {}) {
  const cells = {}
  for (let x = minX; x < minX + width; x += 1) {
    for (let z = minZ; z < minZ + depth; z += 1) {
      cells[getCellKey(x, z)] = { enabled: true, ...data }
    }
  }
  return cells
}

const defaultFloorCells = createCellsFromRect(-5, -5, 10, 10, { floorStyleId: 'floor-classic' })

function clampInteger(value, min, max, fallback) {
  const next = Math.round(Number(value))
  if (!Number.isFinite(next)) return fallback
  return Math.min(max, Math.max(min, next))
}

function getFloorBounds(floorCells) {
  const cells = Object.keys(floorCells)
    .map(parseCellKey)
    .filter(Boolean)

  return cells.reduce((bounds, cell) => ({
    minX: Math.min(bounds.minX, cell.x),
    maxX: Math.max(bounds.maxX, cell.x + 1),
    minZ: Math.min(bounds.minZ, cell.z),
    maxZ: Math.max(bounds.maxZ, cell.z + 1),
  }), {
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  })
}

function normalizeDirection(direction) {
  return HOUSE_ROOM_DIRECTIONS.includes(direction) ? direction : 'east'
}

function makeSafeIdPart(value) {
  return String(value).replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase()
}

function createUniqueId(base, existing) {
  let candidate = base
  let index = 2
  while (existing[candidate]) {
    candidate = `${base}_${index}`
    index += 1
  }
  return candidate
}

function getRoomRect(bounds, direction, width, depth) {
  const centerX = (bounds.minX + bounds.maxX) * 0.5
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5

  if (direction === 'east') {
    const minZ = Math.floor(centerZ - depth * 0.5)
    return { minX: bounds.maxX, maxX: bounds.maxX + width, minZ, maxZ: minZ + depth }
  }

  if (direction === 'west') {
    const minZ = Math.floor(centerZ - depth * 0.5)
    return { minX: bounds.minX - width, maxX: bounds.minX, minZ, maxZ: minZ + depth }
  }

  if (direction === 'north') {
    const minX = Math.floor(centerX - width * 0.5)
    return { minX, maxX: minX + width, minZ: bounds.maxZ, maxZ: bounds.maxZ + depth }
  }

  const minX = Math.floor(centerX - width * 0.5)
  return { minX, maxX: minX + width, minZ: bounds.minZ - depth, maxZ: bounds.minZ }
}

function hasFloorOverlap(floorCells, rect) {
  for (let x = rect.minX; x < rect.maxX; x += 1) {
    for (let z = rect.minZ; z < rect.maxZ; z += 1) {
      if (floorCells[getCellKey(x, z)]) return true
    }
  }
  return false
}

function isAttachmentWall(wall, direction, bounds, center, doorWidth) {
  const vertical = Math.abs(wall.from[0] - wall.to[0]) < 0.001
  const horizontal = Math.abs(wall.from[1] - wall.to[1]) < 0.001

  if (direction === 'east' || direction === 'west') {
    if (!vertical) return false
    const boundaryX = direction === 'east' ? bounds.maxX : bounds.minX
    if (Math.abs(wall.from[0] - boundaryX) > 0.001) return false
    const minZ = Math.min(wall.from[1], wall.to[1])
    const maxZ = Math.max(wall.from[1], wall.to[1])
    return center - doorWidth * 0.5 >= minZ && center + doorWidth * 0.5 <= maxZ
  }

  if (!horizontal) return false
  const boundaryZ = direction === 'north' ? bounds.maxZ : bounds.minZ
  if (Math.abs(wall.from[1] - boundaryZ) > 0.001) return false
  const minX = Math.min(wall.from[0], wall.to[0])
  const maxX = Math.max(wall.from[0], wall.to[0])
  return center - doorWidth * 0.5 >= minX && center + doorWidth * 0.5 <= maxX
}

function getWallDirection(wall) {
  const dx = wall.to[0] - wall.from[0]
  const dz = wall.to[1] - wall.from[1]
  const length = Math.hypot(dx, dz) || 1
  return { x: dx / length, z: dz / length }
}

function getNearbyCellKey(wall, normal) {
  const midX = (wall.from[0] + wall.to[0]) * 0.5
  const midZ = (wall.from[1] + wall.to[1]) * 0.5
  return `${Math.floor(midX + normal[0] * 0.5)},${Math.floor(midZ + normal[2] * 0.5)}`
}

function isInteriorWall(plan, wall) {
  const direction = getWallDirection(wall)
  const leftNormal = [-direction.z, 0, direction.x]
  const rightNormal = [direction.z, 0, -direction.x]
  return Boolean(plan.floorCells[getNearbyCellKey(wall, leftNormal)] && plan.floorCells[getNearbyCellKey(wall, rightNormal)])
}

function getExteriorNormal(plan, wall) {
  const direction = getWallDirection(wall)
  const leftNormal = [-direction.z, 0, direction.x]
  const rightNormal = [direction.z, 0, -direction.x]
  const leftHasFloor = Boolean(plan.floorCells[getNearbyCellKey(wall, leftNormal)])
  const rightHasFloor = Boolean(plan.floorCells[getNearbyCellKey(wall, rightNormal)])

  if (leftHasFloor && !rightHasFloor) return rightNormal
  if (rightHasFloor && !leftHasFloor) return leftNormal
  return null
}

function pointsMatch(a, b) {
  return Math.abs(a[0] - b[0]) < 0.001 && Math.abs(a[1] - b[1]) < 0.001
}

function wallAxisMatches(a, b) {
  const axisA = getWallAxis(a)
  const axisB = getWallAxis(b)
  return axisA.axis === axisB.axis && Math.abs(axisA.constant - axisB.constant) < 0.001
}

function shiftPoint(point, normal, amount) {
  return [
    point[0] + normal[0] * amount,
    point[1] + normal[2] * amount,
  ]
}

function applyWallResizeCells(floorCells, wall, normal, amount) {
  const nextCells = { ...floorCells }
  const steps = Math.abs(amount)
  if (steps < 1) return nextCells

  const vertical = Math.abs(wall.from[0] - wall.to[0]) < 0.001
  const min = vertical ? Math.min(wall.from[1], wall.to[1]) : Math.min(wall.from[0], wall.to[0])
  const max = vertical ? Math.max(wall.from[1], wall.to[1]) : Math.max(wall.from[0], wall.to[0])
  const start = Math.floor(min)
  const end = Math.ceil(max)

  for (let step = 0; step < steps; step += 1) {
    for (let cursor = start; cursor < end; cursor += 1) {
      if (vertical) {
        const wallX = wall.from[0]
        const x = amount > 0
          ? normal[0] > 0 ? wallX + step : wallX - 1 - step
          : normal[0] > 0 ? wallX - 1 - step : wallX + step
        const key = getCellKey(x, cursor)
        if (amount > 0) {
          nextCells[key] = { enabled: true, floorStyleId: 'floor-classic' }
        } else {
          delete nextCells[key]
        }
        continue
      }

      const wallZ = wall.from[1]
      const z = amount > 0
        ? normal[2] > 0 ? wallZ + step : wallZ - 1 - step
        : normal[2] > 0 ? wallZ - 1 - step : wallZ + step
      const key = getCellKey(cursor, z)
      if (amount > 0) {
        nextCells[key] = { enabled: true, floorStyleId: 'floor-classic' }
      } else {
        delete nextCells[key]
      }
    }
  }

  return nextCells
}

function findAttachmentWall(plan, direction, bounds, rect, doorWidth) {
  const center = direction === 'east' || direction === 'west'
    ? (rect.minZ + rect.maxZ) * 0.5
    : (rect.minX + rect.maxX) * 0.5
  return Object.values(plan.walls).find((wall) => isAttachmentWall(wall, direction, bounds, center, doorWidth))
}

function getOpeningOffset(wall, direction, rect) {
  const center = direction === 'east' || direction === 'west'
    ? (rect.minZ + rect.maxZ) * 0.5
    : (rect.minX + rect.maxX) * 0.5
  const from = direction === 'east' || direction === 'west' ? wall.from[1] : wall.from[0]
  const to = direction === 'east' || direction === 'west' ? wall.to[1] : wall.to[0]
  const length = Math.abs(to - from) || 1
  return Math.min(1, Math.max(0, Math.abs(center - from) / length))
}

function createRoomWalls(roomId, rect, direction, height) {
  const walls = {}
  const addWall = (suffix, from, to) => {
    walls[`wall_${roomId}_${suffix}`] = {
      id: `wall_${roomId}_${suffix}`,
      from,
      to,
      height,
    }
  }

  if (direction !== 'west') addWall('east', [rect.maxX, rect.minZ], [rect.maxX, rect.maxZ])
  if (direction !== 'east') addWall('west', [rect.minX, rect.maxZ], [rect.minX, rect.minZ])
  if (direction !== 'south') addWall('north', [rect.maxX, rect.maxZ], [rect.minX, rect.maxZ])
  if (direction !== 'north') addWall('south', [rect.minX, rect.minZ], [rect.maxX, rect.minZ])

  return walls
}

function getWallAxis(wall) {
  const vertical = Math.abs(wall.from[0] - wall.to[0]) < 0.001
  return {
    axis: vertical ? 'z' : 'x',
    constant: vertical ? wall.from[0] : wall.from[1],
    from: vertical ? wall.from[1] : wall.from[0],
    to: vertical ? wall.to[1] : wall.to[0],
  }
}

function getWallPointAtOffset(wall, offset) {
  return [
    wall.from[0] + (wall.to[0] - wall.from[0]) * offset,
    wall.from[1] + (wall.to[1] - wall.from[1]) * offset,
  ]
}

function getWallLength(wall) {
  return Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]) || 1
}

function getWallPoint(axisInfo, value) {
  return axisInfo.axis === 'z'
    ? [axisInfo.constant, value]
    : [value, axisInfo.constant]
}

function getSharedInterval(direction, rect) {
  return direction === 'east' || direction === 'west'
    ? [rect.minZ, rect.maxZ]
    : [rect.minX, rect.maxX]
}

function getOpeningCenterOnWall(wall, opening) {
  const axisInfo = getWallAxis(wall)
  return axisInfo.from + (axisInfo.to - axisInfo.from) * opening.offset
}

function remapOpeningToWall(wall, opening, segment) {
  const axisInfo = getWallAxis(segment)
  const center = getOpeningCenterOnWall(wall, opening)
  const min = Math.min(axisInfo.from, axisInfo.to)
  const max = Math.max(axisInfo.from, axisInfo.to)
  if (center < min - 0.001 || center > max + 0.001) return null
  const length = Math.abs(axisInfo.to - axisInfo.from) || 1
  return {
    ...opening,
    wallId: segment.id,
    offset: Math.min(1, Math.max(0, (center - axisInfo.from) / (axisInfo.to - axisInfo.from || length))),
  }
}

function splitAttachmentWall({ wall, sharedInterval, roomId, existingWalls, existingOpenings }) {
  const axisInfo = getWallAxis(wall)
  const min = Math.min(axisInfo.from, axisInfo.to)
  const max = Math.max(axisInfo.from, axisInfo.to)
  const sharedMin = Math.max(min, Math.min(sharedInterval[0], sharedInterval[1]))
  const sharedMax = Math.min(max, Math.max(sharedInterval[0], sharedInterval[1]))
  const fullOverlap = Math.abs(sharedMin - min) < 0.001 && Math.abs(sharedMax - max) < 0.001
  const idsInUse = { ...existingWalls }

  const createSegment = (suffix, from, to, preferredId = null) => {
    const id = preferredId ?? createUniqueId(`${wall.id}_${suffix}`, idsInUse)
    idsInUse[id] = true
    return {
      ...wall,
      id,
      from: getWallPoint(axisInfo, from),
      to: getWallPoint(axisInfo, to),
    }
  }

  const segments = []
  if (fullOverlap) {
    segments.push(createSegment('shared', min, max, wall.id))
  } else {
    if (sharedMin > min + 0.001) {
      segments.push(createSegment('start', min, sharedMin))
    }
    segments.push(createSegment(`${roomId}_shared`, sharedMin, sharedMax))
    if (sharedMax < max - 0.001) {
      segments.push(createSegment('end', sharedMax, max))
    }
  }

  const sharedSegment = fullOverlap
    ? segments[0]
    : segments.find((segment) => segment.id.includes(roomId)) ?? segments[0]
  const remappedOpenings = {}
  existingOpenings.forEach((opening) => {
    const segment = segments.find((candidate) => remapOpeningToWall(wall, opening, candidate))
    const remapped = segment ? remapOpeningToWall(wall, opening, segment) : null
    if (remapped) remappedOpenings[remapped.id] = remapped
  })

  return {
    sharedSegment,
    walls: Object.fromEntries(segments.map((segment) => [segment.id, segment])),
    openings: remappedOpenings,
  }
}

export const DEFAULT_HOUSE_PLAN = Object.freeze({
  version: HOUSE_PLAN_VERSION,
  gridSize: DEFAULT_HOUSE_GRID_SIZE,
  wallThickness: DEFAULT_HOUSE_WALL_THICKNESS,
  defaultWallHeight: DEFAULT_HOUSE_WALL_HEIGHT,
  entranceDoorId: 'door_entrance',
  floorCells: defaultFloorCells,
  walls: {
    wall_main_west: {
      id: 'wall_main_west',
      from: [-5, 5],
      to: [-5, -5],
      height: 5,
    },
    wall_main_east: {
      id: 'wall_main_east',
      from: [5, -5],
      to: [5, 5],
      height: 5,
    },
    wall_main_south: {
      id: 'wall_main_south',
      from: [-5, -5],
      to: [5, -5],
      height: 5,
    },
    wall_main_north: {
      id: 'wall_main_north',
      from: [5, 5],
      to: [-5, 5],
      height: 5,
    },
  },
  openings: {
    door_entrance: {
      id: 'door_entrance',
      wallId: 'wall_main_west',
      offset: 0.725,
      width: 1.2,
      bottom: 0,
      height: 2.4,
      type: 'door',
      role: 'entrance',
    },
  },
  styles: {
    floorByCell: {},
    wallBySide: {},
    ceilingByCell: {},
  },
})

function normalizePoint(point, fallback) {
  if (!Array.isArray(point) || point.length < 2) return fallback
  const x = Number(point[0])
  const z = Number(point[1])
  return Number.isFinite(x) && Number.isFinite(z) ? [x, z] : fallback
}

function normalizeNumber(value, fallback) {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

function normalizeFloorCells(floorCells) {
  if (!floorCells || typeof floorCells !== 'object') return cloneJson(defaultFloorCells)

  return Object.fromEntries(
    Object.entries(floorCells)
      .filter(([key, cell]) => parseCellKey(key) && cell !== false)
      .map(([key, cell]) => [
        key,
        {
          enabled: true,
          ...(cell && typeof cell === 'object' ? cell : {}),
        },
      ]),
  )
}

function normalizeWalls(walls) {
  if (!walls || typeof walls !== 'object') return cloneJson(DEFAULT_HOUSE_PLAN.walls)

  const normalized = {}
  Object.entries(walls).forEach(([key, wall]) => {
    if (!wall || typeof wall !== 'object') return
    const id = typeof wall.id === 'string' && wall.id ? wall.id : key
    normalized[id] = {
      ...wall,
      id,
      from: normalizePoint(wall.from, [0, 0]),
      to: normalizePoint(wall.to, [0, 0]),
      bottom: normalizeNumber(wall.bottom ?? wall.bottomY, 0),
      height: Math.max(0.1, normalizeNumber(wall.height, DEFAULT_HOUSE_WALL_HEIGHT)),
    }
  })
  return normalized
}

function normalizeOpenings(openings, walls) {
  if (!openings || typeof openings !== 'object') return cloneJson(DEFAULT_HOUSE_PLAN.openings)

  const normalized = {}
  Object.entries(openings).forEach(([key, opening]) => {
    if (!opening || typeof opening !== 'object') return
    if (!opening.wallId || !walls[opening.wallId]) return
    const id = typeof opening.id === 'string' && opening.id ? opening.id : key
    normalized[id] = {
      ...opening,
      id,
      wallId: opening.wallId,
      offset: Math.min(1, Math.max(0, normalizeNumber(opening.offset, 0.5))),
      width: Math.max(0.1, normalizeNumber(opening.width, 1)),
      bottom: Math.max(0, normalizeNumber(opening.bottom ?? opening.bottomY, 0)),
      height: Math.max(0.1, normalizeNumber(opening.height, 2.2)),
      type: opening.type ?? 'door',
      role: opening.role ?? 'normal',
    }
  })
  return normalized
}

export function normalizeHousePlan(plan = DEFAULT_HOUSE_PLAN) {
  const source = plan && typeof plan === 'object' ? plan : DEFAULT_HOUSE_PLAN
  const walls = normalizeWalls(source.walls)
  const openings = normalizeOpenings(source.openings, walls)
  const floorCells = normalizeFloorCells(source.floorCells)
  let entranceDoorId = typeof source.entranceDoorId === 'string' && openings[source.entranceDoorId]
    ? source.entranceDoorId
    : Object.values(openings).find((opening) => opening.role === 'entrance')?.id ?? null

  // Une entrée dont le mur est devenu intérieur (extension devant la porte)
  // redevient une porte normale : le joueur devra définir une nouvelle entrée.
  if (entranceDoorId) {
    const entrance = openings[entranceDoorId]
    const entranceWall = walls[entrance.wallId]
    if (!entranceWall || !getExteriorNormal({ floorCells }, entranceWall)) {
      openings[entranceDoorId] = { ...entrance, role: 'normal' }
      entranceDoorId = null
    }
  }

  return {
    version: HOUSE_PLAN_VERSION,
    gridSize: Math.max(0.25, normalizeNumber(source.gridSize, DEFAULT_HOUSE_GRID_SIZE)),
    wallThickness: Math.max(0.05, normalizeNumber(source.wallThickness, DEFAULT_HOUSE_WALL_THICKNESS)),
    defaultWallHeight: Math.max(0.1, normalizeNumber(source.defaultWallHeight, DEFAULT_HOUSE_WALL_HEIGHT)),
    entranceDoorId,
    floorCells,
    walls,
    openings,
    styles: {
      floorByCell: { ...(source.styles?.floorByCell ?? {}) },
      wallBySide: { ...(source.styles?.wallBySide ?? {}) },
      ceilingByCell: { ...(source.styles?.ceilingByCell ?? {}) },
    },
  }
}

export function createDefaultHousePlan() {
  return normalizeHousePlan(DEFAULT_HOUSE_PLAN)
}

export function addRoomToHousePlan(plan, options = {}) {
  const normalized = normalizeHousePlan(plan)
  const direction = normalizeDirection(options.direction)
  const width = clampInteger(options.width, MIN_ROOM_SIZE, MAX_ROOM_SIZE, 4)
  const depth = clampInteger(options.depth, MIN_ROOM_SIZE, MAX_ROOM_SIZE, 6)
  const doorWidth = Math.min(
    clampInteger(options.doorWidth, 1, Math.min(width, depth), 2),
    direction === 'east' || direction === 'west' ? depth : width,
  )
  const bounds = getFloorBounds(normalized.floorCells)
  if (!Number.isFinite(bounds.minX)) return normalized

  const rect = getRoomRect(bounds, direction, width, depth)
  if (hasFloorOverlap(normalized.floorCells, rect)) return normalized

  const attachmentWall = findAttachmentWall(normalized, direction, bounds, rect, doorWidth)
  if (!attachmentWall) return normalized

  const roomBaseId = createUniqueId(
    `room_${makeSafeIdPart(direction)}_${rect.minX}_${rect.minZ}`,
    normalized.walls,
  )
  const attachmentOpenings = Object.values(normalized.openings).filter((opening) => opening.wallId === attachmentWall.id)
  const splitWall = splitAttachmentWall({
    wall: attachmentWall,
    sharedInterval: getSharedInterval(direction, rect),
    roomId: roomBaseId,
    existingWalls: normalized.walls,
    existingOpenings: attachmentOpenings,
  })
  const wallsWithoutAttachment = Object.fromEntries(
    Object.entries(normalized.walls).filter(([id]) => id !== attachmentWall.id),
  )
  const openingsWithoutAttachment = Object.fromEntries(
    Object.entries(normalized.openings).filter(([, opening]) => opening.wallId !== attachmentWall.id),
  )
  const floorCells = { ...normalized.floorCells }
  Object.entries(createCellsFromRect(rect.minX, rect.minZ, rect.maxX - rect.minX, rect.maxZ - rect.minZ, { floorStyleId: 'floor-classic' })).forEach(([key, cell]) => {
    floorCells[key] = cell
  })
  const openingId = createUniqueId(`door_to_${roomBaseId}`, {
    ...openingsWithoutAttachment,
    ...splitWall.openings,
  })
  const roomWalls = createRoomWalls(roomBaseId, rect, direction, normalized.defaultWallHeight)

  return normalizeHousePlan({
    ...normalized,
    floorCells,
    walls: {
      ...wallsWithoutAttachment,
      ...splitWall.walls,
      ...roomWalls,
    },
    openings: {
      ...openingsWithoutAttachment,
      ...splitWall.openings,
      [openingId]: {
        id: openingId,
        wallId: splitWall.sharedSegment.id,
        offset: getOpeningOffset(splitWall.sharedSegment, direction, rect),
        width: doorWidth,
        bottom: 0,
        height: 2.4,
        type: 'door',
        role: 'junction',
      },
    },
  })
}

export function addPrototypeEastRoom(plan) {
  return addRoomToHousePlan(plan, { direction: 'east', width: 4, depth: 6, doorWidth: 1 })
}

export function removeLatestJunctionDoor(plan) {
  const normalized = normalizeHousePlan(plan)
  const junctionDoor = Object.values(normalized.openings)
    .filter((opening) => opening.role === 'junction')
    .at(-1)
  if (!junctionDoor) return normalized

  const openings = { ...normalized.openings }
  delete openings[junctionDoor.id]
  return normalizeHousePlan({
    ...normalized,
    openings,
  })
}

export function removeHouseOpening(plan, openingId) {
  const normalized = normalizeHousePlan(plan)
  if (!normalized.openings[openingId]) return normalized
  // La maison doit toujours garder une entrée : définir une autre entrée d'abord.
  if (openingId === normalized.entranceDoorId) return normalized

  const openings = { ...normalized.openings }
  delete openings[openingId]
  return normalizeHousePlan({
    ...normalized,
    openings,
  })
}

export function addHouseOpeningToWall(plan, wallId, offset, options = {}) {
  const normalized = normalizeHousePlan(plan)
  const wall = normalized.walls[wallId]
  if (!wall) return normalized

  const type = options.type === 'window' ? 'window' : 'door'
  const width = Math.max(0.4, normalizeNumber(options.width, type === 'window' ? 1.6 : 1.2))
  const length = getWallLength(wall)
  if (length < width + 0.4) return normalized

  const margin = (width * 0.5 + 0.2) / length
  const nextOffset = Math.min(1 - margin, Math.max(margin, normalizeNumber(offset, 0.5)))
  const center = nextOffset * length
  const overlapsExisting = Object.values(normalized.openings).some((opening) => {
    if (opening.wallId !== wallId) return false
    const otherCenter = opening.offset * length
    return Math.abs(otherCenter - center) < (opening.width + width) * 0.5 + 0.2
  })
  if (overlapsExisting) return normalized

  const id = createUniqueId(`${type}_${makeSafeIdPart(wallId)}`, normalized.openings)
  return normalizeHousePlan({
    ...normalized,
    openings: {
      ...normalized.openings,
      [id]: {
        id,
        wallId,
        offset: nextOffset,
        width,
        bottom: Math.max(0, normalizeNumber(options.bottom, type === 'window' ? 0.9 : 0)),
        height: Math.max(0.1, normalizeNumber(options.height, type === 'window' ? 1.4 : 2.4)),
        type,
        role: 'normal',
      },
    },
  })
}

// Redéfinit la position et la largeur d'une ouverture sur son mur (poignées de
// redimensionnement d'une vitre/porte). Refuse le chevauchement plutôt que de
// pousser les ouvertures voisines.
export function setHouseOpeningSpan(plan, openingId, offset, width) {
  const normalized = normalizeHousePlan(plan)
  const opening = normalized.openings[openingId]
  if (!opening) return normalized
  const wall = normalized.walls[opening.wallId]
  if (!wall) return normalized

  const length = getWallLength(wall)
  const nextWidth = Math.max(0.4, Math.min(normalizeNumber(width, opening.width), length - 0.4))
  const halfWidth = nextWidth * 0.5
  const rawCenter = normalizeNumber(offset, opening.offset) * length
  const center = Math.min(length - halfWidth - 0.2, Math.max(halfWidth + 0.2, rawCenter))
  const overlapsExisting = Object.values(normalized.openings).some((other) => {
    if (other.id === openingId || other.wallId !== opening.wallId) return false
    const otherCenter = other.offset * length
    return Math.abs(otherCenter - center) < (other.width + nextWidth) * 0.5 + 0.2
  })
  if (overlapsExisting) return normalized

  return normalizeHousePlan({
    ...normalized,
    openings: {
      ...normalized.openings,
      [openingId]: {
        ...opening,
        offset: center / length,
        width: nextWidth,
      },
    },
  })
}

// Applique une texture de sol à un ensemble de cellules (typiquement toutes les
// cellules d'un espace détecté : « appliquer à toute la pièce »).
// styleId null = retour à la texture globale par défaut.
export function setHouseFloorStyleForCells(plan, cellKeys, styleId) {
  const normalized = normalizeHousePlan(plan)
  if (!Array.isArray(cellKeys) || !cellKeys.length) return normalized

  const floorByCell = { ...normalized.styles.floorByCell }
  cellKeys.forEach((key) => {
    if (!parseCellKey(key) || !normalized.floorCells[key]) return
    if (typeof styleId === 'string' && styleId) floorByCell[key] = styleId
    else delete floorByCell[key]
  })

  return normalizeHousePlan({
    ...normalized,
    styles: {
      ...normalized.styles,
      floorByCell,
    },
  })
}

export function setHouseWallSideStyle(plan, wallId, side, styleId) {
  const normalized = normalizeHousePlan(plan)
  if (!normalized.walls[wallId]) return normalized
  // 'left'/'right' : côtés géométriques (cloisons entre deux pièces).
  // 'inside'/'outside' : clés historiques, gardées pour compat.
  if (!['inside', 'outside', 'left', 'right'].includes(side)) return normalized

  const key = `${wallId}:${side}`
  const wallBySide = { ...normalized.styles.wallBySide }
  if (typeof styleId === 'string' && styleId) wallBySide[key] = styleId
  else delete wallBySide[key]

  return normalizeHousePlan({
    ...normalized,
    styles: {
      ...normalized.styles,
      wallBySide,
    },
  })
}

// Règle la dimension verticale d'une ouverture (hauteur de vitre, allège).
// Bornes : l'ouverture reste dans le mur avec un linteau d'au moins 0.1.
export function setHouseOpeningVertical(plan, openingId, options = {}) {
  const normalized = normalizeHousePlan(plan)
  const opening = normalized.openings[openingId]
  if (!opening) return normalized
  const wall = normalized.walls[opening.wallId]
  if (!wall) return normalized

  const maxTop = wall.height - 0.1
  const bottom = Math.min(maxTop - 0.3, Math.max(0, normalizeNumber(options.bottom, opening.bottom)))
  const height = Math.min(maxTop - bottom, Math.max(0.3, normalizeNumber(options.height, opening.height)))

  return normalizeHousePlan({
    ...normalized,
    openings: {
      ...normalized.openings,
      [openingId]: {
        ...opening,
        bottom,
        height,
      },
    },
  })
}

export function setHouseEntranceDoor(plan, openingId) {
  const normalized = normalizeHousePlan(plan)
  const opening = normalized.openings[openingId]
  if (!opening || opening.type !== 'door') return normalized
  if (openingId === normalized.entranceDoorId) return normalized

  const wall = normalized.walls[opening.wallId]
  if (!wall || !getExteriorNormal(normalized, wall)) return normalized

  const openings = Object.fromEntries(
    Object.entries(normalized.openings).map(([id, current]) => {
      if (id === openingId) return [id, { ...current, role: 'entrance' }]
      if (current.role === 'entrance') return [id, { ...current, role: 'normal' }]
      return [id, current]
    }),
  )

  return normalizeHousePlan({
    ...normalized,
    entranceDoorId: openingId,
    openings,
  })
}

export function moveHouseOpening(plan, openingId, wallId, offset) {
  const normalized = normalizeHousePlan(plan)
  const opening = normalized.openings[openingId]
  const wall = normalized.walls[wallId]
  if (!opening || !wall) return normalized

  const length = getWallLength(wall)
  const margin = Math.min(0.45, opening.width * 0.5 / length)
  const nextOffset = Math.min(1 - margin, Math.max(margin, normalizeNumber(offset, opening.offset)))

  return normalizeHousePlan({
    ...normalized,
    openings: {
      ...normalized.openings,
      [openingId]: {
        ...opening,
        wallId,
        offset: nextOffset,
      },
    },
  })
}

export function removeHouseWall(plan, wallId) {
  const normalized = normalizeHousePlan(plan)
  const wall = normalized.walls[wallId]
  if (!wall || !isInteriorWall(normalized, wall)) return normalized

  const walls = { ...normalized.walls }
  delete walls[wallId]
  const openings = Object.fromEntries(
    Object.entries(normalized.openings).filter(([, opening]) => opening.wallId !== wallId),
  )

  return normalizeHousePlan({
    ...normalized,
    walls,
    openings,
  })
}

export function addInteriorWallToHousePlan(plan, start, end) {
  const normalized = normalizeHousePlan(plan)
  const rawFrom = normalizePoint(start, null)
  const rawEnd = normalizePoint(end, null)
  if (!rawFrom || !rawEnd) return normalized

  // Les cloisons s'alignent sur les bords de cellules (grille entière) : la
  // détection d'espaces raisonne par cellule, une cloison à x=2.25 ne
  // séparerait aucune pièce.
  const from = [Math.round(rawFrom[0]), Math.round(rawFrom[1])]
  const rawTo = [Math.round(rawEnd[0]), Math.round(rawEnd[1])]

  const dx = rawTo[0] - from[0]
  const dz = rawTo[1] - from[1]
  const to = Math.abs(dx) >= Math.abs(dz)
    ? [rawTo[0], from[1]]
    : [from[0], rawTo[1]]
  if (Math.hypot(to[0] - from[0], to[1] - from[1]) < 1) return normalized

  const id = createUniqueId(`wall_partition_${from[0]}_${from[1]}_${to[0]}_${to[1]}`, normalized.walls)
  return normalizeHousePlan({
    ...normalized,
    walls: {
      ...normalized.walls,
      [id]: {
        id,
        from,
        to,
        height: normalized.defaultWallHeight,
      },
    },
  })
}

export function splitHouseWallSegment(plan, wallId, offset = 0.5) {
  const normalized = normalizeHousePlan(plan)
  const wall = normalized.walls[wallId]
  const splitOffset = Math.min(0.9, Math.max(0.1, Number(offset)))
  if (!wall || !Number.isFinite(splitOffset)) return normalized

  const splitPoint = getWallPointAtOffset(wall, splitOffset)
  const openingsOnWall = Object.values(normalized.openings).filter((opening) => opening.wallId === wallId)
  const splitDistance = Math.hypot(
    splitPoint[0] - wall.from[0],
    splitPoint[1] - wall.from[1],
  )
  const crossingOpening = openingsOnWall.some((opening) => {
    const length = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]) || 1
    const center = opening.offset * length
    return splitDistance > center - opening.width * 0.5 && splitDistance < center + opening.width * 0.5
  })
  if (crossingOpening) return normalized

  const firstId = createUniqueId(`${wall.id}_a`, normalized.walls)
  const secondId = createUniqueId(`${wall.id}_b`, { ...normalized.walls, [firstId]: true })
  const firstWall = {
    ...wall,
    id: firstId,
    to: splitPoint,
  }
  const secondWall = {
    ...wall,
    id: secondId,
    from: splitPoint,
  }
  const remainingWalls = Object.fromEntries(
    Object.entries(normalized.walls).filter(([id]) => id !== wallId),
  )
  const openingsWithoutWall = Object.fromEntries(
    Object.entries(normalized.openings).filter(([, opening]) => opening.wallId !== wallId),
  )
  const remappedOpenings = {}
  openingsOnWall.forEach((opening) => {
    const targetWall = opening.offset < splitOffset ? firstWall : secondWall
    const remapped = remapOpeningToWall(wall, opening, targetWall)
    if (remapped) remappedOpenings[remapped.id] = remapped
  })

  return normalizeHousePlan({
    ...normalized,
    walls: {
      ...remainingWalls,
      [firstId]: firstWall,
      [secondId]: secondWall,
    },
    openings: {
      ...openingsWithoutWall,
      ...remappedOpenings,
    },
  })
}

export function removeLatestInteriorWall(plan) {
  const normalized = normalizeHousePlan(plan)
  const interiorWall = Object.values(normalized.walls)
    .filter((wall) => isInteriorWall(normalized, wall))
    .at(-1)
  if (!interiorWall) return normalized

  const walls = { ...normalized.walls }
  delete walls[interiorWall.id]
  const openings = Object.fromEntries(
    Object.entries(normalized.openings).filter(([, opening]) => opening.wallId !== interiorWall.id),
  )

  return normalizeHousePlan({
    ...normalized,
    walls,
    openings,
  })
}

function shiftWallWithConnections(normalized, wall, normal, steps) {
  const shiftedFrom = shiftPoint(wall.from, normal, steps)
  const shiftedTo = shiftPoint(wall.to, normal, steps)
  const walls = {}
  const connectorWalls = {}
  const addConnector = (point, shiftedPoint, suffix) => {
    if (pointsMatch(point, shiftedPoint)) return
    const id = createUniqueId(`${wall.id}_connector_${suffix}`, {
      ...normalized.walls,
      ...walls,
      ...connectorWalls,
    })
    connectorWalls[id] = {
      id,
      from: point,
      to: shiftedPoint,
      height: wall.height,
      bottom: wall.bottom,
    }
  }

  Object.entries(normalized.walls).forEach(([id, candidate]) => {
    if (id === wall.id) {
      walls[id] = {
        ...candidate,
        from: shiftedFrom,
        to: shiftedTo,
      }
      return
    }

    const fromMatchesStart = pointsMatch(candidate.from, wall.from)
    const fromMatchesEnd = pointsMatch(candidate.from, wall.to)
    const toMatchesStart = pointsMatch(candidate.to, wall.from)
    const toMatchesEnd = pointsMatch(candidate.to, wall.to)
    const touchesMovedWall = fromMatchesStart || fromMatchesEnd || toMatchesStart || toMatchesEnd
    if (!touchesMovedWall) {
      walls[id] = candidate
      return
    }

    if (wallAxisMatches(candidate, wall)) {
      walls[id] = candidate
      if (fromMatchesStart || toMatchesStart) addConnector(wall.from, shiftedFrom, 'from')
      if (fromMatchesEnd || toMatchesEnd) addConnector(wall.to, shiftedTo, 'to')
      return
    }

    walls[id] = {
      ...candidate,
      from: fromMatchesStart
        ? shiftedFrom
        : fromMatchesEnd
          ? shiftedTo
          : candidate.from,
      to: toMatchesStart
        ? shiftedFrom
        : toMatchesEnd
          ? shiftedTo
          : candidate.to,
    }
  })

  return {
    ...walls,
    ...connectorWalls,
  }
}

export function resizeHouseExteriorWall(plan, wallId, amount) {
  const normalized = normalizeHousePlan(plan)
  const wall = normalized.walls[wallId]
  const steps = clampInteger(amount, -4, 4, 0)
  if (!wall || steps === 0) return normalized

  const normal = getExteriorNormal(normalized, wall)
  if (!normal) return normalized

  const floorCells = applyWallResizeCells(normalized.floorCells, wall, normal, steps)
  if (Object.keys(floorCells).length < MIN_ROOM_SIZE * MIN_ROOM_SIZE) return normalized

  return normalizeHousePlan({
    ...normalized,
    floorCells,
    walls: shiftWallWithConnections(normalized, wall, normal, steps),
  })
}

// Déplace une cloison intérieure perpendiculairement à son axe (amount = pas de
// grille le long de la normale gauche [-dz, 0, dx]). Le sol ne change pas : ce
// sont les espaces détectés qui se rééquilibrent de part et d'autre.
export function moveHouseInteriorWall(plan, wallId, amount) {
  const normalized = normalizeHousePlan(plan)
  const wall = normalized.walls[wallId]
  const steps = clampInteger(amount, -4, 4, 0)
  if (!wall || steps === 0) return normalized
  if (!isInteriorWall(normalized, wall)) return normalized

  const direction = getWallDirection(wall)
  const normal = [-direction.z, 0, direction.x]
  const next = normalizeHousePlan({
    ...normalized,
    walls: shiftWallWithConnections(normalized, wall, normal, steps),
  })
  const movedWall = next.walls[wallId]
  if (!movedWall || !isInteriorWall(next, movedWall)) return normalized
  return next
}

function getOpeningAxisSpan(wall, opening) {
  const axisInfo = getWallAxis(wall)
  const center = axisInfo.from + (axisInfo.to - axisInfo.from) * opening.offset
  return {
    min: center - opening.width * 0.5,
    max: center + opening.width * 0.5,
    center,
  }
}

function replaceWallSpan(normalized, wall, nextFrom, nextTo) {
  const axisInfo = getWallAxis(wall)
  const nextWall = {
    ...wall,
    from: getWallPoint(axisInfo, nextFrom),
    to: getWallPoint(axisInfo, nextTo),
  }
  const openings = { ...normalized.openings }
  Object.values(normalized.openings)
    .filter((opening) => opening.wallId === wall.id)
    .forEach((opening) => {
      const remapped = remapOpeningToWall(wall, opening, nextWall)
      if (remapped) {
        openings[opening.id] = remapped
      } else {
        delete openings[opening.id]
      }
    })

  return normalizeHousePlan({
    ...normalized,
    walls: {
      ...normalized.walls,
      [wall.id]: nextWall,
    },
    openings,
  })
}

// Redimensionne une cloison en déplaçant une extrémité libre le long de son axe.
// L'extrémité est libre si aucun autre mur ne s'y raccorde par un sommet ;
// sinon il faut passer par moveHouseWallJoint (point de segment).
export function resizeHouseWallEnd(plan, wallId, end, targetValue) {
  const normalized = normalizeHousePlan(plan)
  const wall = normalized.walls[wallId]
  if (!wall) return normalized

  const movingPoint = end === 'from' ? wall.from : wall.to
  const endpointShared = Object.values(normalized.walls).some((candidate) => (
    candidate.id !== wallId &&
    (pointsMatch(candidate.from, movingPoint) || pointsMatch(candidate.to, movingPoint))
  ))
  if (endpointShared) return normalized

  const axisInfo = getWallAxis(wall)
  const fixedValue = end === 'from' ? axisInfo.to : axisInfo.from
  let nextValue = Math.round(normalizeNumber(targetValue, NaN))
  if (!Number.isFinite(nextValue)) return normalized
  if (Math.abs(nextValue - fixedValue) < 1) return normalized

  // Ne pas couper une porte existante : l'extrémité s'arrête au bord de l'ouverture.
  Object.values(normalized.openings)
    .filter((opening) => opening.wallId === wallId)
    .forEach((opening) => {
      const span = getOpeningAxisSpan(wall, opening)
      const openingSide = Math.sign(span.center - fixedValue)
      const valueSide = Math.sign(nextValue - fixedValue)
      if (openingSide !== valueSide) return
      if (valueSide > 0) nextValue = Math.max(nextValue, Math.ceil(span.max + 0.2))
      else nextValue = Math.min(nextValue, Math.floor(span.min - 0.2))
    })

  const nextFrom = end === 'from' ? nextValue : axisInfo.from
  const nextTo = end === 'to' ? nextValue : axisInfo.to
  return replaceWallSpan(normalized, wall, nextFrom, nextTo)
}

// Déplace un point de découpe entre deux segments colinéaires : l'un s'allonge,
// l'autre se raccourcit, et le mur est donc "recoupé" à la nouvelle position.
export function moveHouseWallJoint(plan, wallIdA, wallIdB, targetValue) {
  const normalized = normalizeHousePlan(plan)
  const wallA = normalized.walls[wallIdA]
  const wallB = normalized.walls[wallIdB]
  if (!wallA || !wallB || !wallAxisMatches(wallA, wallB)) return normalized

  const jointOnA = pointsMatch(wallA.to, wallB.from) || pointsMatch(wallA.to, wallB.to) ? 'to' : 'from'
  const jointPoint = jointOnA === 'to' ? wallA.to : wallA.from
  const jointOnB = pointsMatch(wallB.from, jointPoint) ? 'from' : pointsMatch(wallB.to, jointPoint) ? 'to' : null
  if (!jointOnB) return normalized

  const axisA = getWallAxis(wallA)
  const axisB = getWallAxis(wallB)
  const fixedA = jointOnA === 'to' ? axisA.from : axisA.to
  const fixedB = jointOnB === 'to' ? axisB.from : axisB.to
  let nextValue = Math.round(normalizeNumber(targetValue, NaN))
  if (!Number.isFinite(nextValue)) return normalized

  // Chaque segment garde une longueur d'au moins 1.
  const low = Math.min(fixedA, fixedB) + 1
  const high = Math.max(fixedA, fixedB) - 1
  if (low > high) return normalized
  nextValue = Math.min(high, Math.max(low, nextValue))

  // Le point de découpe ne traverse pas une ouverture.
  const clampAgainstOpenings = (wall) => {
    Object.values(normalized.openings)
      .filter((opening) => opening.wallId === wall.id)
      .forEach((opening) => {
        const span = getOpeningAxisSpan(wall, opening)
        if (nextValue <= span.min - 0.2 || nextValue >= span.max + 0.2) return
        const jointValue = axisA.axis === 'z' ? jointPoint[1] : jointPoint[0]
        nextValue = jointValue >= span.center
          ? Math.ceil(span.max + 0.2)
          : Math.floor(span.min - 0.2)
      })
  }
  clampAgainstOpenings(wallA)
  clampAgainstOpenings(wallB)
  if (nextValue < low || nextValue > high) return normalized

  const withResizedA = replaceWallSpan(
    normalized,
    wallA,
    jointOnA === 'from' ? nextValue : axisA.from,
    jointOnA === 'to' ? nextValue : axisA.to,
  )
  const wallBAfter = withResizedA.walls[wallIdB]
  const axisBAfter = getWallAxis(wallBAfter)
  return replaceWallSpan(
    withResizedA,
    wallBAfter,
    jointOnB === 'from' ? nextValue : axisBAfter.from,
    jointOnB === 'to' ? nextValue : axisBAfter.to,
  )
}
