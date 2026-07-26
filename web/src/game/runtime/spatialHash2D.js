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
    this.nextQueryStamp = 1
  }

  clear() {
    this.cells.clear()
    this.keyedEntries.clear()
    this.nextEntryId = 1
    this.nextOrder = 0
    this.nextQueryStamp = 1
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
    if (!previous) return this.insertKeyedPoint(key, value, x, z)
    if (![x, z].every(Number.isFinite)) return previous

    const nextCellKey = this.getCellKey(
      this.getCellCoordinate(x),
      this.getCellCoordinate(z),
    )
    const previousCellKey = previous.cellKeys[0]
    previous.value = value
    previous.minX = x
    previous.minZ = z
    previous.maxX = x
    previous.maxZ = z

    if (previousCellKey === nextCellKey) return previous

    this.removeEntryFromCell(previous, previousCellKey)
    const entries = this.cells.get(nextCellKey) ?? []
    entries.push(previous)
    this.cells.set(nextCellKey, entries)
    previous.cellKeys = [nextCellKey]
    return previous
  }

  removeEntryFromCell(entry, cellKey) {
    const entries = this.cells.get(cellKey)
    if (!entries) return
    const index = entries.indexOf(entry)
    if (index >= 0) entries.splice(index, 1)
    if (entries.length === 0) this.cells.delete(cellKey)
  }

  removeKey(key) {
    const entry = this.keyedEntries.get(key)
    if (!entry) return false

    entry.cellKeys.forEach((cellKey) => {
      this.removeEntryFromCell(entry, cellKey)
    })
    this.keyedEntries.delete(key)
    return true
  }

  removeKeysNotIn(keys) {
    for (const key of this.keyedEntries.keys()) {
      if (!keys.has(key)) this.removeKey(key)
    }
  }

  insertAabb(value, minX, minZ, maxX, maxZ, order = this.nextOrder) {
    if (![minX, minZ, maxX, maxZ].every(Number.isFinite)) return null

    const bounds = normalizeBounds(minX, minZ, maxX, maxZ)
    const entry = {
      id: this.nextEntryId,
      order,
      value,
      cellKeys: [],
      queryStamp: 0,
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
    return this.queryRadiusInto([], x, z, radius)
  }

  queryRadiusInto(result, x, z, radius) {
    const safeRadius = Math.max(0, Number.isFinite(radius) ? radius : 0)
    const radiusSquared = safeRadius * safeRadius
    this.queryAabbInto(
      result,
      x - safeRadius,
      z - safeRadius,
      x + safeRadius,
      z + safeRadius,
    )

    let writeIndex = 0
    for (let index = 0; index < result.length; index += 1) {
      const value = result[index]
      const valueX = value?.position?.x ?? value?.x
      const valueZ = value?.position?.z ?? value?.z
      if (Number.isFinite(valueX) && Number.isFinite(valueZ)) {
        const dx = valueX - x
        const dz = valueZ - z
        if (dx * dx + dz * dz > radiusSquared) continue
      }
      result[writeIndex] = value
      writeIndex += 1
    }
    result.length = writeIndex
    return result
  }

  queryAabb(minX, minZ, maxX, maxZ) {
    return this.queryAabbInto([], minX, minZ, maxX, maxZ)
  }

  queryAabbInto(result, minX, minZ, maxX, maxZ) {
    result.length = 0
    if (![minX, minZ, maxX, maxZ].every(Number.isFinite)) return result

    const bounds = normalizeBounds(minX, minZ, maxX, maxZ)
    const minCellX = this.getCellCoordinate(bounds.minX)
    const minCellZ = this.getCellCoordinate(bounds.minZ)
    const maxCellX = this.getCellCoordinate(bounds.maxX)
    const maxCellZ = this.getCellCoordinate(bounds.maxZ)
    const queryStamp = this.nextQueryStamp
    this.nextQueryStamp += 1

    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        const entries = this.cells.get(this.getCellKey(cellX, cellZ))
        if (!entries) continue

        entries.forEach((entry) => {
          if (entry.queryStamp === queryStamp) return
          entry.queryStamp = queryStamp
          if (
            entry.maxX < bounds.minX ||
            entry.minX > bounds.maxX ||
            entry.maxZ < bounds.minZ ||
            entry.minZ > bounds.maxZ
          ) return
          result.push(entry)
        })
      }
    }

    result.sort((left, right) => left.order - right.order)
    for (let index = 0; index < result.length; index += 1) {
      result[index] = result[index].value
    }
    return result
  }
}
