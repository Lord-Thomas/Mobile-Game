import { describe, expect, it } from 'vitest'
import {
  MOB_ACTIVITY_TIERS,
  getClosestPlayerDistanceSquared,
  getMobActivityInterval,
  isMobVisuallyActive,
  resolveMobActivityTier,
} from './mobActivity'

describe('mob activity tiers', () => {
  const mob = { x: 0, y: 0, z: 0 }

  it('uses the closest active player, accepting array and object positions', () => {
    expect(getClosestPlayerDistanceSquared(mob, [
      { position: [50, 0, 0] },
      { position: { x: 3, y: 0, z: 4 } },
      { active: false, position: [1, 0, 0] },
    ])).toBe(25)
  })

  it('classifies full, reduced, visible, and dormant ranges', () => {
    expect(resolveMobActivityTier('dormant', mob, [{ position: [20, 0, 0] }])).toBe('full')
    expect(resolveMobActivityTier('dormant', mob, [{ position: [55, 0, 0] }])).toBe('reduced')
    expect(resolveMobActivityTier('dormant', mob, [{ position: [90, 0, 0] }])).toBe('visible')
    expect(resolveMobActivityTier('full', mob, [{ position: [140, 0, 0] }])).toBe('dormant')
  })

  it('keeps the current tier inside its exit radius to prevent boundary thrashing', () => {
    expect(resolveMobActivityTier('full', mob, [{ position: [36, 0, 0] }])).toBe('full')
    expect(resolveMobActivityTier('reduced', mob, [{ position: [76, 0, 0] }])).toBe('reduced')
    expect(resolveMobActivityTier('visible', mob, [{ position: [112, 0, 0] }])).toBe('visible')
  })

  it('sleeps when no player can activate the mob', () => {
    expect(resolveMobActivityTier('full', mob, [])).toBe(MOB_ACTIVITY_TIERS.DORMANT)
    expect(resolveMobActivityTier('full', mob, [null])).toBe(MOB_ACTIVITY_TIERS.DORMANT)
  })

  it('maps tiers to their runtime cadence and visibility', () => {
    expect(getMobActivityInterval('full')).toBe(0)
    expect(getMobActivityInterval('reduced')).toBeCloseTo(0.1)
    expect(getMobActivityInterval('visible')).toBeCloseTo(0.5)
    expect(getMobActivityInterval('dormant')).toBe(Number.POSITIVE_INFINITY)
    expect(isMobVisuallyActive('visible')).toBe(true)
    expect(isMobVisuallyActive('dormant')).toBe(false)
  })
})
