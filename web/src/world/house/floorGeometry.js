import { getCellKey, parseCellKey } from './housePlan'

// Décompose un ensemble de cellules de sol en rectangles pleins (greedy) :
// on prend la cellule la plus basse/gauche restante, on étend la ligne en +x,
// puis on étend le rectangle en +z tant que la ligne complète existe.
// Sert au rendu sol/plafond/toit et aux colliders pour les formes en L.
export function decomposeCellsIntoRects(cellKeys) {
  const remaining = new Set(cellKeys)
  const cells = [...remaining]
    .map(parseCellKey)
    .filter(Boolean)
    .sort((a, b) => a.z - b.z || a.x - b.x)
  const rects = []

  cells.forEach((cell) => {
    const key = getCellKey(cell.x, cell.z)
    if (!remaining.has(key)) return

    let maxX = cell.x + 1
    while (remaining.has(getCellKey(maxX, cell.z))) maxX += 1

    let maxZ = cell.z + 1
    let rowComplete = true
    while (rowComplete) {
      for (let x = cell.x; x < maxX; x += 1) {
        if (!remaining.has(getCellKey(x, maxZ))) {
          rowComplete = false
          break
        }
      }
      if (rowComplete) maxZ += 1
    }

    for (let x = cell.x; x < maxX; x += 1) {
      for (let z = cell.z; z < maxZ; z += 1) {
        remaining.delete(getCellKey(x, z))
      }
    }

    rects.push({ minX: cell.x, minZ: cell.z, maxX, maxZ })
  })

  return rects
}

export function getCellsBounds(cellKeys) {
  const cells = cellKeys.map(parseCellKey).filter(Boolean)
  if (!cells.length) return null

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

// Génère les données d'un maillage plat couvrant les rectangles (quads XZ),
// avec des UVs en coordonnées monde pour que la texture soit continue entre
// rectangles. Le BufferGeometry est construit côté rendu (three).
export function createFloorRectsGeometryData(rects, uvScale = 1) {
  const positions = []
  const uvs = []
  const indices = []

  rects.forEach((rect) => {
    const base = positions.length / 3
    const corners = [
      [rect.minX, rect.minZ],
      [rect.maxX, rect.minZ],
      [rect.maxX, rect.maxZ],
      [rect.minX, rect.maxZ],
    ]
    corners.forEach(([x, z]) => {
      positions.push(x, 0, z)
      uvs.push(x * uvScale, z * uvScale)
    })
    // Deux triangles orientés +Y (sens anti-horaire vu de dessus).
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2)
  })

  return { positions, uvs, indices }
}
