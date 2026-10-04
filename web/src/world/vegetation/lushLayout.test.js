import { describe, expect, it } from 'vitest'
import { createLushLayout } from './lushLayout'
import { createPlantGeometry } from './plantGeometry'
describe('lush environment study', () => {
  it('keeps placements stable and the central passage clear', () => {
    const plants = createLushLayout()
    expect(plants).toEqual(createLushLayout())
    expect(plants.length).toBe(216)
    expect(plants.every(p => Math.abs(p.position[0]) > 1.8)).toBe(true)
    expect(new Set(plants.map(p => p.kind)).size).toBe(3)
  })
  it('honors exclusion areas and follows sampled terrain', () => {
    const plants = createLushLayout({ origin: [20, 30], canPlace: (x, z, r) => x - r > 20, heightAt: (x, z) => x * 0.1 + z * 0.2 })
    expect(plants.length).toBeGreaterThan(0)
    for (const p of plants) {
      expect(p.position[0]).toBeGreaterThan(20)
      expect(p.position[1]).toBeCloseTo(p.position[0] * 0.1 + p.position[2] * 0.2 - 0.025)
    }
    expect(createLushLayout({ canPlace: () => false })).toEqual([])
  })
  it('produces finite bounded geometry within a modest triangle budget', () => {
    for (const kind of ['shrub','fern','grass']) {
      const g = createPlantGeometry(kind)
      expect(Array.from(g.attributes.position.array).every(Number.isFinite)).toBe(true)
      expect(g.index.count / 3).toBeLessThan(1100)
      expect(g.boundingSphere.radius).toBeLessThan(2)
      expect(Math.max(...g.index.array)).toBeLessThan(g.attributes.position.count)
      g.dispose()
    }
  })
})
