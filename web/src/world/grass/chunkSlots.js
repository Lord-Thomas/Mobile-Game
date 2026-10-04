// Slots remain fixed while a chunk is in range. Recycle only retired chunks;
// never clear the whole visible buffer during normal movement.
export function createChunkSlots(capacity) {
  const slots = new Map()
  const free = Array.from({ length: capacity }, (_, i) => capacity - i - 1)
  return {
    slots,
    claim(key) {
      if (slots.has(key)) return slots.get(key)
      if (!free.length) throw new Error('Grass chunk capacity exhausted')
      const slot = free.pop()
      slots.set(key, slot)
      return slot
    },
    retireOutside(activeKeys) {
      const retired = []
      for (const [key, slot] of slots) {
        if (activeKeys.has(key)) continue
        slots.delete(key)
        free.push(slot)
        retired.push({ key, slot })
      }
      return retired
    },
  }
}

export function writeGrassSlot(mesh, slot, capacity, items, spawnTime) {
  if (items.length > capacity) throw new Error('Grass chunk exceeds slot capacity')
  const offset = slot * capacity
  const matrices = mesh.instanceMatrix.array
  const spawn = mesh.geometry.getAttribute('instanceSpawnTime')
  const slope = mesh.geometry.getAttribute('instanceGroundSlope')
  for (let j = 0; j < capacity; j++) {
    const index = (offset + j) * 16
    matrices.fill(0, index, index + 16)
    const item = items[j]
    const scale = item?.scale ?? 1
    matrices[index] = matrices[index + 5] = matrices[index + 10] = scale
    matrices[index + 12] = item?.position[0] ?? 0
    matrices[index + 13] = item?.position[1] ?? -10000
    matrices[index + 14] = item?.position[2] ?? 0
    matrices[index + 15] = 1
    spawn.array[offset + j] = spawnTime
    if (slope) {
      slope.array[(offset + j) * 2] = item?.groundSlope?.[0] ?? 0
      slope.array[(offset + j) * 2 + 1] = item?.groundSlope?.[1] ?? 0
    }
  }
  mesh.instanceMatrix.addUpdateRange(offset * 16, capacity * 16)
  spawn.addUpdateRange(offset, capacity)
  mesh.instanceMatrix.needsUpdate = true
  spawn.needsUpdate = true
  if (slope) {
    slope.addUpdateRange(offset * 2, capacity * 2)
    slope.needsUpdate = true
  }
}
