export const HOUSE_PLAN_VERSION = 1
export const DEFAULT_HOUSE_GRID_SIZE = 1
export const DEFAULT_HOUSE_WALL_THICKNESS = 0.22
export const DEFAULT_HOUSE_WALL_HEIGHT = 5
export const DEFAULT_HOUSE_EXTERIOR_COLOR = '#f3f0e5'
export const DEFAULT_HOUSE_INTERIOR_COLOR = '#e6edf6'

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
  const entranceDoorId = typeof source.entranceDoorId === 'string' && openings[source.entranceDoorId]
    ? source.entranceDoorId
    : Object.values(openings).find((opening) => opening.role === 'entrance')?.id ?? null

  return {
    version: HOUSE_PLAN_VERSION,
    gridSize: Math.max(0.25, normalizeNumber(source.gridSize, DEFAULT_HOUSE_GRID_SIZE)),
    wallThickness: Math.max(0.05, normalizeNumber(source.wallThickness, DEFAULT_HOUSE_WALL_THICKNESS)),
    defaultWallHeight: Math.max(0.1, normalizeNumber(source.defaultWallHeight, DEFAULT_HOUSE_WALL_HEIGHT)),
    entranceDoorId,
    floorCells: normalizeFloorCells(source.floorCells),
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

export function addPrototypeEastRoom(plan) {
  const normalized = normalizeHousePlan(plan)
  if (normalized.walls.wall_extension_east) return normalized

  const floorCells = { ...normalized.floorCells }
  Object.entries(createCellsFromRect(5, -3, 4, 6, { floorStyleId: 'floor-classic' })).forEach(([key, cell]) => {
    floorCells[key] = cell
  })

  return normalizeHousePlan({
    ...normalized,
    floorCells,
    walls: {
      ...normalized.walls,
      wall_extension_east: {
        id: 'wall_extension_east',
        from: [9, -3],
        to: [9, 3],
        height: 4.2,
      },
      wall_extension_south: {
        id: 'wall_extension_south',
        from: [5, -3],
        to: [9, -3],
        height: 4.2,
      },
      wall_extension_north: {
        id: 'wall_extension_north',
        from: [9, 3],
        to: [5, 3],
        height: 4.2,
      },
    },
    openings: {
      ...normalized.openings,
      door_main_to_extension: {
        id: 'door_main_to_extension',
        wallId: 'wall_main_east',
        offset: 0.5,
        width: 1.25,
        bottom: 0,
        height: 2.4,
        type: 'door',
        role: 'junction',
      },
    },
  })
}
