import { describe, expect, it } from 'vitest'
import { GRASS_LODS, grassGridAxis, grassSampleLevel, grassLevelCapacity } from './grassLod'
import { createChunkSlots } from './chunkSlots'

describe('unified grass LOD coverage', () => {
  it.each([0.22, 0.3])('reconstructs every original sample exactly once at step %s', step => {
    for (const start of [-188, -186, -6, 0, 6, 186]) {
      const axis = grassGridAxis(start, Math.min(start + 6, 188), step)
      const sets = [new Set(), new Set(), new Set()]
      axis.forEach((x, i) => axis.forEach((z, j) => sets[grassSampleLevel(i, j)].add(`${x}:${z}`)))
      expect(sets.reduce((n, set) => n + set.size, 0)).toBe(axis.length ** 2)
      for (let level = 0; level < 3; level++) expect(sets[level].size).toBeLessThanOrEqual(grassLevelCapacity(step, level))
      expect(sets[2].size).toBeGreaterThan(0)
    }
  })
  it('retains the coarse field over movement, reversals and teleportation', () => {
    const coarse = createChunkSlots(4096)
    const world = new Set()
    for (let x = -32; x < 32; x++) for (let z = -32; z < 32; z++) world.add(`${x}:${z}`)
    for (const key of world) coarse.claim(key)
    const before = [...coarse.slots]
    for (const [cx, cz] of [[0, 0], [5, -8], [-31, 31], [31, -31], [0, 0]]) {
      const active = new Set([...world].filter(key => {
        const [x, z] = key.split(':').map(Number)
        return Math.max(Math.abs(x - cx), Math.abs(z - cz)) <= GRASS_LODS[2].radius
      }))
      expect(coarse.retireOutside(active)).toEqual([])
      expect([...coarse.slots]).toEqual(before)
    }
  })
  it('keeps a bounded mobile instance allocation below 180k cards', () => {
    const total = GRASS_LODS.reduce((sum, lod, level) => sum + grassLevelCapacity(0.3, level) *
      (level === 2 ? 4096 : (lod.radius * 2 + 1) ** 2), 0)
    expect(total).toBeLessThan(180000)
  })
})
