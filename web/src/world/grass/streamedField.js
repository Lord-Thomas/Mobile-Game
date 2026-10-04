import { Box3, Vector3 } from 'three'

export const STREAM_CELL_SIZE = 8
export const STREAM_RADIUS_CELLS = 15 // 120 m: preload beyond the 100 m visible limit.
export const STREAM_SLOT_COUNT = (STREAM_RADIUS_CELLS * 2 + 1) ** 2
export const EARTH_AREA_SIDE = 22_584_000 // Flat square, approximately 510 million km².

function hash(value) {
  let n = value >>> 0
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d)
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b)
  return (n ^ (n >>> 16)) >>> 0
}

export function createStreamedField(density = 5, size = 1000) {
  const divisions = Math.max(1, Math.round(STREAM_CELL_SIZE / (0.22 / Math.sqrt(density))))
  const capacity = divisions ** 2
  const spacing = STREAM_CELL_SIZE / divisions
  const ranks = Float32Array.from({ length: capacity }, (_, i) => (i + 0.5) / capacity)
  const slots = Array.from({ length: STREAM_SLOT_COUNT }, (_, id) => ({
    id, key: null, cx: 0, cz: 0, count: 0, version: 0,
    data: new Float32Array(capacity * 4), ranks,
    bounds: new Box3(new Vector3(-2, -2, -2), new Vector3(10, 2, 10)),
  }))
  const active = new Map()
  const order = new Uint32Array(capacity)
  let pending = [], targetKey = null, generated = 0
  const half = size / 2
  function target(worldX, worldZ) {
    const cx = Math.floor(worldX / STREAM_CELL_SIZE), cz = Math.floor(worldZ / STREAM_CELL_SIZE)
    const key = `${cx}:${cz}`
    if (targetKey === key) return
    targetKey = key
    const wanted = new Map()
    for (let dx = -STREAM_RADIUS_CELLS; dx <= STREAM_RADIUS_CELLS; dx++) {
      for (let dz = -STREAM_RADIUS_CELLS; dz <= STREAM_RADIUS_CELLS; dz++) {
        const x = cx + dx, z = cz + dz
        if (x * 8 >= half || (x + 1) * 8 <= -half || z * 8 >= half || (z + 1) * 8 <= -half) continue
        wanted.set(`${x}:${z}`, { key: `${x}:${z}`, cx: x, cz: z, distance: Math.max(Math.abs(dx), Math.abs(dz)) })
      }
    }
    for (const [oldKey, slot] of active) {
      if (!wanted.has(oldKey)) { active.delete(oldKey); slot.key = null; slot.count = 0; slot.version++ }
    }
    pending = [...wanted.values()].filter(cell => !active.has(cell.key)).sort((a, b) => a.distance - b.distance)
  }
  function fill(slot, cell) {
    const seed = hash(Math.imul(cell.cx, 73856093) ^ Math.imul(cell.cz, 19349663))
    for (let i = 0; i < capacity; i++) order[i] = i
    let state = seed
    for (let i = capacity - 1; i > 0; i--) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      const j = Math.floor(state / 4294967296 * (i + 1))
      const old = order[i]; order[i] = order[j]; order[j] = old
    }
    let count = 0
    for (let i = 0; i < capacity; i++) {
      const index = order[i]
      const a = hash(seed ^ Math.imul(index + 1, 1597334677)) / 4294967296
      const b = hash(seed ^ Math.imul(index + 1, 3812015801)) / 4294967296
      const c = hash(seed ^ Math.imul(index + 1, 958282583)) / 4294967296
      const x = (index % divisions + 0.5) * spacing + (a - 0.5) * 0.9
      const z = (Math.floor(index / divisions) + 0.5) * spacing + (b - 0.5) * 0.9
      if (Math.abs(cell.cx * 8 + x) > half - 0.15 || Math.abs(cell.cz * 8 + z) > half - 0.15) continue
      const offset = count++ * 4
      slot.data[offset] = x; slot.data[offset + 1] = 0.04
      slot.data[offset + 2] = z; slot.data[offset + 3] = 0.18 + c * 0.12
    }
    Object.assign(slot, { key: cell.key, cx: cell.cx, cz: cell.cz, count, version: slot.version + 1 })
    active.set(cell.key, slot)
    generated++
  }
  return {
    slots, capacity,
    byteLength: slots.length * capacity * 16 + ranks.byteLength + order.byteLength,
    target,
    // Bounded work per frame. Slots and their GPU buffers survive recycling.
    step(budgetMs = 3, maxCells = 6) {
      const start = performance.now()
      let built = 0
      while (pending.length && built < maxCells && (built === 0 || performance.now() - start < budgetMs)) {
        const slot = slots.find(item => item.key === null)
        if (!slot) throw new Error('Streaming grass exceeded its fixed slot budget')
        fill(slot, pending.shift()); built++
      }
      return built
    },
    stats() {
      return { count: [...active.values()].reduce((sum, slot) => sum + slot.count, 0),
        loaded: active.size, pending: pending.length, generated, capacity: slots.length }
    },
  }
}
