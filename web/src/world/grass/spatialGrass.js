import { Box3, Vector3 } from 'three'

// Repack existing instances verbatim; positions stay in world coordinates so
// wind, seeded orientation and colour remain identical across batch boundaries.
export function partitionGrassField(fields, cellSize = 8) {
  const cells = new Map()
  const keyAt = (data, i) => `${Math.floor(data[i] / cellSize)}:${Math.floor(data[i + 2] / cellSize)}`
  for (const { data, count } of fields) {
    for (let i = 0; i < count * 4; i += 4) {
      const key = keyAt(data, i)
      if (!cells.has(key)) cells.set(key, { count: 0 })
      cells.get(key).count++
    }
  }
  for (const cell of cells.values()) {
    cell.data = new Float32Array(cell.count * 4)
    cell.cursor = 0
    cell.bounds = new Box3()
  }
  const point = new Vector3()
  for (const { data, count } of fields) {
    for (let i = 0; i < count * 4; i += 4) {
      const cell = cells.get(keyAt(data, i))
      cell.data.set(data.subarray(i, i + 4), cell.cursor)
      cell.cursor += 4
      cell.bounds.expandByPoint(point.set(data[i], data[i + 1], data[i + 2]))
    }
  }
  // Conservative allowance for the whole tuft, wind, lean and both interactions.
  // GPU displacement is invisible to Three.js automatic bound computation.
  return Array.from(cells.values(), cell => ({ data: cell.data, count: cell.count,
    bounds: cell.bounds.expandByScalar(2) }))
}
