import { describe, expect, it } from 'vitest'
import { BufferGeometry, InstancedBufferAttribute } from 'three'
import { createChunkSlots, writeGrassSlot } from './chunkSlots'

function windowKeys(x, z, radius = 5) {
  const keys = new Set()
  for (let i = x - radius; i <= x + radius; i++) for (let j = z - radius; j <= z + radius; j++) keys.add(`${i}:${j}`)
  return keys
}

describe('persistent grass chunk slots', () => {
  it('preserves every overlapping slot over long journeys, reversals, and teleports', () => {
    const pool = createChunkSlots(121)
    const route = Array.from({ length: 120 }, (_, i) => [i - 60, Math.floor(i / 4) - 15])
    route.push(...[...route].reverse(), [1000, -1000], [0, 0])
    for (const [x, z] of route) {
      const target = windowKeys(x, z), before = new Map(pool.slots)
      const retired = pool.retireOutside(target)
      expect(retired.every(p => !target.has(p.key))).toBe(true)
      for (const key of target) pool.claim(key)
      for (const [key, slot] of before) if (target.has(key)) expect(pool.slots.get(key)).toBe(slot)
      expect(pool.slots.size).toBe(121)
      expect(new Set(pool.slots.values()).size).toBe(121)
      expect(Math.max(...pool.slots.values())).toBeLessThan(121)
    }
  })
  it('does not allocate duplicates and detects capacity errors', () => {
    const pool = createChunkSlots(1)
    expect(pool.claim('0:0')).toBe(pool.claim('0:0'))
    expect(() => pool.claim('1:0')).toThrow('capacity')
    pool.retireOutside(new Set())
    expect(pool.claim('1:0')).toBe(0)
  })
  it('uploads numeric ranges and never overwrites another visible chunk', () => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('instanceSpawnTime', new InstancedBufferAttribute(new Float32Array(6), 1))
    const mesh = { geometry, instanceMatrix: new InstancedBufferAttribute(new Float32Array(6 * 16), 16) }
    const plant = { scale: 0.24, position: [5, 0.7, 3] }
    writeGrassSlot(mesh, 0, 3, [plant], 10)
    const before = [...mesh.instanceMatrix.array.slice(0, 48)]
    writeGrassSlot(mesh, 1, 3, [plant, plant], 12)
    expect([...mesh.instanceMatrix.array.slice(0, 48)]).toEqual(before)
    for (const range of mesh.instanceMatrix.updateRanges) {
      expect(Number.isFinite(range.start)).toBe(true)
      expect(Number.isFinite(range.count)).toBe(true)
      expect(range.start + range.count).toBeLessThanOrEqual(mesh.instanceMatrix.array.length)
    }
    const second = [...mesh.instanceMatrix.array.slice(48)]
    writeGrassSlot(mesh, 0, 3, [], -1000)
    expect([...mesh.instanceMatrix.array.slice(48)]).toEqual(second)
    expect(mesh.instanceMatrix.array[13]).toBe(-10000)
    expect(() => writeGrassSlot(mesh, 0, 1, [plant, plant], 0)).toThrow('capacity')
  })
  it('retires chunks beyond even the most distant visible blade', () => {
    const radius = 5, chunkSize = 6, maxVisible = 22 + 4, jitter = 0.45
    // Cross any chunk boundary in either direction: the nearest point in the
    // retired strip is still beyond the shader fade, including placement jitter.
    expect(radius * chunkSize - jitter).toBeGreaterThan(maxVisible)
  })
})
