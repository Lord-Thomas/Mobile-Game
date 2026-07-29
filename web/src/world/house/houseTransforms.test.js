import { describe, expect, it } from 'vitest'
import { localHousePointToWorld, worldPointToHouseLocal } from './houseTransforms'

describe('house coordinate transforms', () => {
  it('uses the same positive Y rotation convention as Three.js', () => {
    const world = localHousePointToWorld(10, 20, Math.PI / 2, 3, 2)

    expect(world.x).toBeCloseTo(12)
    expect(world.z).toBeCloseTo(17)
  })

  it('round-trips annex and roof centers without mirroring them', () => {
    const local = { x: 4.45, z: 0.55 }
    const rotationY = 0.73
    const world = localHousePointToWorld(-8, 14, rotationY, local.x, local.z)
    const restored = worldPointToHouseLocal(-8, 14, rotationY, world.x, world.z)

    expect(restored.x).toBeCloseTo(local.x)
    expect(restored.z).toBeCloseTo(local.z)
  })
})
