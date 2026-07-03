import {
  DEFAULT_HOUSE_EXTERIOR_COLOR,
  DEFAULT_HOUSE_INTERIOR_COLOR,
  normalizeHousePlan,
} from './housePlan'
import { detectHouseSpaces } from './houseSpaces'
import { decomposeCellsIntoRects, getCellsBounds } from './floorGeometry'

function getCornerId(x, z) {
  return `corner_${String(x).replace('-', 'm').replace('.', 'p')}_${String(z).replace('-', 'm').replace('.', 'p')}`
}

function getWallDirection(wall) {
  const dx = wall.to[0] - wall.from[0]
  const dz = wall.to[1] - wall.from[1]
  const length = Math.hypot(dx, dz) || 1
  return { x: dx / length, z: dz / length, length }
}

function getNearbyCellKey(wall, normal) {
  const midX = (wall.from[0] + wall.to[0]) * 0.5
  const midZ = (wall.from[1] + wall.to[1]) * 0.5
  return `${Math.floor(midX + normal[0] * 0.5)},${Math.floor(midZ + normal[2] * 0.5)}`
}

function createSpaceLookup(spaces) {
  const lookup = new Map()
  spaces.forEach((space) => {
    space.cells.forEach((cellKey) => lookup.set(cellKey, space.id))
  })
  return lookup
}

function getWallSides(wall, plan, spaceLookup) {
  const direction = getWallDirection(wall)
  const leftNormal = [-direction.z, 0, direction.x]
  const rightNormal = [direction.z, 0, -direction.x]

  return [leftNormal, rightNormal].map((normal) => {
    const cellKey = getNearbyCellKey(wall, normal)
    const roomId = spaceLookup.get(cellKey)
    if (!plan.floorCells[cellKey] || !roomId) {
      return {
        type: 'outside',
        material: 'facade_main',
        color: DEFAULT_HOUSE_EXTERIOR_COLOR,
        styleId: plan.styles?.wallBySide?.[`${wall.id}:outside`] ?? null,
        normal,
      }
    }

    return {
      type: 'room',
      roomId,
      material: 'active_wall',
      color: DEFAULT_HOUSE_INTERIOR_COLOR,
      styleId: plan.styles?.wallBySide?.[`${wall.id}:inside`] ?? null,
      normal,
    }
  })
}

// Regroupe les cellules de sol par texture (null = texture globale par défaut)
// puis décompose chaque groupe en rectangles pleins pour le rendu.
function getFloorStyleRects(plan) {
  const groups = new Map()
  Object.keys(plan.floorCells).forEach((key) => {
    const styleId = plan.styles?.floorByCell?.[key] ?? null
    if (!groups.has(styleId)) groups.set(styleId, [])
    groups.get(styleId).push(key)
  })

  return [...groups.entries()].map(([styleId, cellKeys]) => ({
    styleId,
    rects: decomposeCellsIntoRects(cellKeys),
  }))
}

function normalizeWallSegment(segment, cornerById, wallThickness) {
  const startCorner = cornerById[segment.start]
  const endCorner = cornerById[segment.end]
  const dx = endCorner.x - startCorner.x
  const dz = endCorner.z - startCorner.z
  const length = Math.hypot(dx, dz)
  const isHorizontal = Math.abs(dx) >= Math.abs(dz)
  const alongSign = isHorizontal ? Math.sign(dx) || 1 : Math.sign(dz) || 1
  const alongStart = isHorizontal ? startCorner.x : startCorner.z

  return {
    ...segment,
    startCorner,
    endCorner,
    thickness: segment.thickness ?? wallThickness,
    length,
    axis: isHorizontal ? 'x' : 'z',
    constant: isHorizontal ? startCorner.z : startCorner.x,
    from: isHorizontal ? startCorner.x : startCorner.z,
    to: isHorizontal ? endCorner.x : endCorner.z,
    openings: (segment.openings ?? []).map((opening) => ({
      ...opening,
      center: Number.isFinite(opening.distance)
        ? opening.distance
        : (opening.center - alongStart) * alongSign,
    })),
  }
}

function createRoom(space, plan) {
  const { bounds } = space
  const width = bounds.maxX - bounds.minX
  const depth = bounds.maxZ - bounds.minZ
  const height = Object.values(plan.walls).reduce((maxHeight, wall) => Math.max(maxHeight, wall.height), plan.defaultWallHeight)

  return {
    id: space.id,
    name: space.name,
    position: [(bounds.minX + bounds.maxX) * 0.5, 0, (bounds.minZ + bounds.maxZ) * 0.5],
    size: [width, height, depth],
    floorColor: '#b8ad9b',
    wallColor: DEFAULT_HOUSE_INTERIOR_COLOR,
    exteriorColor: DEFAULT_HOUSE_EXTERIOR_COLOR,
    cornerIds: [
      getCornerId(bounds.minX, bounds.minZ),
      getCornerId(bounds.maxX, bounds.minZ),
      getCornerId(bounds.maxX, bounds.maxZ),
      getCornerId(bounds.minX, bounds.maxZ),
    ],
    openings: [],
  }
}

const ENTRANCE_INSIDE_OFFSET = 1.2
const ENTRANCE_OUTSIDE_OFFSET = 2.2

// Position monde de la porte d'entrée + points d'entrée/sortie du joueur.
// Si aucune entrée n'est définie (mur devenu intérieur), retombe sur la première
// porte extérieure pour que la transition intérieur/extérieur reste jouable.
export function getHouseEntranceTransform(layout) {
  const entranceDoorId = layout.plan?.entranceDoorId ?? null
  let fallback = null

  for (const wall of layout.walls) {
    const outsideSide = wall.sideA?.type === 'outside'
      ? wall.sideA
      : wall.sideB?.type === 'outside' ? wall.sideB : null
    if (!outsideSide) continue

    for (const opening of wall.openings ?? []) {
      if (opening.type !== 'door') continue
      const direction = {
        x: (wall.endCorner.x - wall.startCorner.x) / (wall.length || 1),
        z: (wall.endCorner.z - wall.startCorner.z) / (wall.length || 1),
      }
      const doorX = wall.startCorner.x + direction.x * opening.center
      const doorZ = wall.startCorner.z + direction.z * opening.center
      const [nx, , nz] = outsideSide.normal
      const transform = {
        openingId: opening.id,
        wallId: wall.id,
        width: opening.width,
        height: opening.height,
        bottom: opening.bottom ?? 0,
        doorPosition: { x: doorX, z: doorZ },
        insidePosition: { x: doorX - nx * ENTRANCE_INSIDE_OFFSET, z: doorZ - nz * ENTRANCE_INSIDE_OFFSET },
        outsidePosition: { x: doorX + nx * ENTRANCE_OUTSIDE_OFFSET, z: doorZ + nz * ENTRANCE_OUTSIDE_OFFSET },
        rotationY: Math.atan2(nx, nz),
        outsideNormal: [nx, 0, nz],
        isFallback: opening.id !== entranceDoorId,
      }

      if (opening.id === entranceDoorId) return transform
      fallback ??= transform
    }
  }

  return fallback
}

export function deriveHouseLayout(sourcePlan) {
  const plan = normalizeHousePlan(sourcePlan)
  const spaces = detectHouseSpaces(plan)
  const spaceLookup = createSpaceLookup(spaces)
  const cornersById = new Map()

  Object.values(plan.walls).forEach((wall) => {
    const startId = getCornerId(wall.from[0], wall.from[1])
    const endId = getCornerId(wall.to[0], wall.to[1])
    cornersById.set(startId, { id: startId, x: wall.from[0], z: wall.from[1] })
    cornersById.set(endId, { id: endId, x: wall.to[0], z: wall.to[1] })
  })

  spaces.forEach((space) => {
    const { bounds } = space
    ;[
      [bounds.minX, bounds.minZ],
      [bounds.maxX, bounds.minZ],
      [bounds.maxX, bounds.maxZ],
      [bounds.minX, bounds.maxZ],
    ].forEach(([x, z]) => {
      const id = getCornerId(x, z)
      cornersById.set(id, { id, x, z })
    })
  })

  const corners = [...cornersById.values()]
  const cornerById = Object.fromEntries(corners.map((corner) => [corner.id, corner]))
  const openingsByWallId = Object.values(plan.openings).reduce((grouped, opening) => {
    grouped[opening.wallId] ??= []
    grouped[opening.wallId].push(opening)
    return grouped
  }, {})
  const walls = Object.values(plan.walls).map((wall) => {
    const [sideA, sideB] = getWallSides(wall, plan, spaceLookup)
    const start = getCornerId(wall.from[0], wall.from[1])
    const end = getCornerId(wall.to[0], wall.to[1])
    const length = getWallDirection(wall).length

    return normalizeWallSegment({
      id: wall.id,
      start,
      end,
      bottom: wall.bottom,
      height: wall.height,
      sideA,
      sideB,
      openings: (openingsByWallId[wall.id] ?? []).map((opening) => ({
        id: opening.id,
        type: opening.type,
        role: opening.role,
        distance: length * opening.offset,
        width: opening.width,
        bottom: opening.bottom,
        height: opening.height,
      })),
    }, cornerById, plan.wallThickness)
  })

  const enabledCellKeys = Object.keys(plan.floorCells)
  const maxWallHeight = Object.values(plan.walls)
    .reduce((maxHeight, wall) => Math.max(maxHeight, wall.height), plan.defaultWallHeight)

  return {
    wallThickness: plan.wallThickness,
    plan,
    spaces,
    corners,
    rooms: spaces.map((space) => createRoom(space, plan)),
    walls,
    // Empreinte réelle du sol (rectangles pleins) : sol/plafond/toit/colliders
    // doivent s'appuyer dessus, pas sur les bounding boxes des pièces (formes en L).
    footprintRects: decomposeCellsIntoRects(enabledCellKeys),
    floorStyleRects: getFloorStyleRects(plan),
    bounds: getCellsBounds(enabledCellKeys),
    maxWallHeight,
  }
}
