import { parseCellKey } from './housePlan'

const DIRECTIONS = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
]

function getCellKey(x, z) {
  return `${x},${z}`
}

function wallBlocksCellEdge(wall, cell, direction) {
  const [ax, az] = wall.from
  const [bx, bz] = wall.to
  const horizontal = Math.abs(az - bz) < 0.001
  const vertical = Math.abs(ax - bx) < 0.001

  if (direction.dx !== 0 && !vertical) return false
  if (direction.dz !== 0 && !horizontal) return false

  if (vertical) {
    const boundaryX = direction.dx > 0 ? cell.x + 1 : cell.x
    if (Math.abs(Math.round(ax) - boundaryX) > 0.001) return false
    const minZ = Math.min(az, bz)
    const maxZ = Math.max(az, bz)
    return Math.max(cell.z, minZ) < Math.min(cell.z + 1, maxZ)
  }

  const boundaryZ = direction.dz > 0 ? cell.z + 1 : cell.z
  if (Math.abs(Math.round(az) - boundaryZ) > 0.001) return false
  const minX = Math.min(ax, bx)
  const maxX = Math.max(ax, bx)
  return Math.max(cell.x, minX) < Math.min(cell.x + 1, maxX)
}

function hasSeparatingWall(plan, cell, direction) {
  return Object.values(plan.walls).some((wall) => wallBlocksCellEdge(wall, cell, direction))
}

function getSpaceBounds(cells) {
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

export function detectHouseSpaces(plan) {
  const enabledCells = Object.entries(plan.floorCells)
    .map(([key, cell]) => ({ key, parsed: parseCellKey(key), cell }))
    .filter(({ parsed, cell }) => parsed && cell?.enabled !== false)
    .map(({ key, parsed }) => ({ key, ...parsed }))
  const pending = new Set(enabledCells.map((cell) => cell.key))
  const byKey = new Map(enabledCells.map((cell) => [cell.key, cell]))
  const spaces = []

  while (pending.size) {
    const seedKey = pending.values().next().value
    const queue = [byKey.get(seedKey)]
    const cells = []
    pending.delete(seedKey)

    while (queue.length) {
      const cell = queue.shift()
      cells.push(cell)

      DIRECTIONS.forEach((direction) => {
        if (hasSeparatingWall(plan, cell, direction)) return
        const neighborKey = getCellKey(cell.x + direction.dx, cell.z + direction.dz)
        if (!pending.has(neighborKey)) return
        pending.delete(neighborKey)
        queue.push(byKey.get(neighborKey))
      })
    }

    const bounds = getSpaceBounds(cells)
    const id = spaces.length === 0 ? 'main_room' : `space_${spaces.length + 1}`
    spaces.push({
      id,
      name: spaces.length === 0 ? 'Piece principale' : `Piece ${spaces.length + 1}`,
      cells: cells.map(({ key }) => key).sort(),
      bounds,
      enclosed: true,
    })
  }

  return spaces
}
