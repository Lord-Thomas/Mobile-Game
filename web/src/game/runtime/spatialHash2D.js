function normalizeBounds(minX, minZ, maxX, maxZ) {
  return {
    minX: Math.min(minX, maxX),
    minZ: Math.min(minZ, maxZ),
    maxX: Math.max(minX, maxX),
    maxZ: Math.max(minZ, maxZ),
  }
}

export class SpatialHash2D {
  constructor(cellSize = 8) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new Error('SpatialHash2D cellSize must be a positive finite number.')
    }

    this.cellSize = cellSize
    this.cells = new Map()
    this.keyedEntries = new Map()
    this.nextEntryId = 1
    this.nextOrder = 0
  }

  clear() {
    this.cells.clear()
    this.keyedEntries.clear()
    this.nextEntryId = 1
    this.nextOrder = 0
  }

  getCellCoordinate(value) {
    return Math.floor(value / this.cellSize)
  }

  getCellKey(cellX, cellZ) {
    return `${cellX}:${cellZ}`
  }

  insertPoint(value, x, z, order = this.nextOrder) {
    return this.insertAabb(value, x, z, x, z, order)
  }

  insertKeyedPoint(key, value, x, z, order = this.nextOrder) {
    this.removeKey(key)
    const entry = this.insertAabb(value, x, z, x, z, order)
    if (entry) {
      entry.key = key
      this.keyedEntries.set(key, entry)
    }
    return entry
  }

  updateKeyedPoint(key, value, x, z) {
    const previous = this.keyedEntries.get(key)
    const order = previous?.order ?? this.nextOrder
    return this.insertKeyedPoint(key, value, x, z, order)
  }

  removeKey(key) {
    const entry = this.keyedEntries.get(key)
    if (!entry) return false

    entry.cellKeys.forEach((cellKey) => {
      const entries = this.cells.get(cellKey)
      if (!entries) return
      const nextEntries = entries.filter((candidate) => candidate !== entry)
      if (nextEntries.length > 0) this.cells.set(cellKey, nextEntries)
      else this.cells.delete(cellKey)
    })
    this.keyedEntries.delete(key)
    return true
  }

  insertAabb(value, minX, minZ, maxX, maxZ, order = this.nextOrder) {
    if (![minX, minZ, maxX, maxZ].every(Number.isFinite)) return null

    const bounds = normalizeBounds(minX, minZ, maxX, maxZ)
    const entry = {
      id: this.nextEntryId,
      order,
      value,
      cellKeys: [],
      ...bounds,
    }
    this.nextEntryId += 1
    this.nextOrder = Math.max(this.nextOrder, order + 1)

    const minCellX = this.getCellCoordinate(bounds.minX)
    const minCellZ = this.getCellCoordinate(bounds.minZ)
    const maxCellX = this.getCellCoordinate(bounds.maxX)
    const maxCellZ = this.getCellCoordinate(bounds.maxZ)

    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        const key = this.getCellKey(cellX, cellZ)
        const entries = this.cells.get(key) ?? []
        entries.push(entry)
        this.cells.set(key, entries)
        entry.cellKeys.push(key)
      }
    }

    return entry
  }

  queryPoint(x, z) {
    return this.queryAabb(x, z, x, z)
  }

  queryRadius(x, z, radius) {
    const safeRadius = Math.max(0, Number.isFinite(radius) ? radius : 0)
    const radiusSquared = safeRadius * safeRadius
    return this.queryAabb(
      x - safeRadius,
      z - safeRadius,
      x + safeRadius,
      z + safeRadius,
    ).filter((value) => {
      const valueX = value?.position?.x ?? value?.x
      const valueZ = value?.position?.z ?? value?.z
      if (!Number.isFinite(valueX) || !Number.isFinite(valueZ)) return true
      const dx = valueX - x
      const dz = valueZ - z
      return dx * dx + dz * dz <= radiusSquared
    })
  }

  queryAabb(minX, minZ, maxX, maxZ) {
    if (![minX, minZ, maxX, maxZ].every(Number.isFinite)) return []

    const bounds = normalizeBounds(minX, minZ, maxX, maxZ)
    const minCellX = this.getCellCoordinate(bounds.minX)
    const minCellZ = this.getCellCoordinate(bounds.minZ)
    const maxCellX = this.getCellCoordinate(bounds.maxX)
    const maxCellZ = this.getCellCoordinate(bounds.maxZ)
    const seen = new Set()
    const matches = []

    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        const entries = this.cells.get(this.getCellKey(cellX, cellZ))
        if (!entries) continue

        entries.forEach((entry) => {
          if (seen.has(entry.id)) return
          seen.add(entry.id)
          if (
            entry.maxX < bounds.minX ||
            entry.minX > bounds.maxX ||
            entry.maxZ < bounds.minZ ||
            entry.minZ > bounds.maxZ
          ) return
          matches.push(entry)
        })
      }
    }

    matches.sort((left, right) => left.order - right.order)
    return matches.map((entry) => entry.value)
  }
}
