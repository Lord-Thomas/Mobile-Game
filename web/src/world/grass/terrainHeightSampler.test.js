import { expect, it } from 'vitest'
import { createTerrainHeightSampler } from './terrainHeightSampler'
import { createPlacementSampler } from './placementSampler'

it('plants on both actual terrain triangles, including their shared edge', () => {
  // Non-planar quad: bilinear interpolation would not match this surface.
  const terrain = { size: 2, segments: 1, geometry: { attributes: { position: {
    array: Float32Array.from([-1, 0, -1, 1, 2, -1, -1, 4, 1, 1, 10, 1]),
  } } } }
  const sample = createTerrainHeightSampler(terrain)
  expect(sample(-0.5, -0.5)).toBeCloseTo(1.5)
  expect(sample(0.5, 0.5)).toBeCloseTo(6.5)
  expect(sample(0, 0)).toBeCloseTo(3)
  expect(sample(1, 1)).toBe(10)
  expect(sample(-1, -1)).toBe(0)
  expect(sample(1.4, 1.4)).toBe(10)
})

it('reuses placement samples while preserving a smooth continuous density', () => {
  let calls = 0
  const sample = createPlacementSampler(-2, 2, (x, z) => {
    calls++
    return 0.5 + x * 0.05 + z * 0.1
  })
  expect(sample(0.2, 0.3)).toBeCloseTo(0.54)
  expect(calls).toBe(4)
  expect(sample(0.3, 0.4)).toBeCloseTo(0.555)
  expect(calls).toBe(4)
  expect(sample(0.49999, 0.3)).toBeCloseTo(sample(0.50001, 0.3), 5)
})
