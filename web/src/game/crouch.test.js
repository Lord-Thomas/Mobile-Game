import { describe, expect, it } from 'vitest'
import { CROUCH_WALK_SPEED, getBirdApproachLimits } from './crouch'

describe('crouching near birds', () => {
  it('allows a quiet player to feed inside the standing fear radius', () => {
    const quiet = getBirdApproachLimits(true)
    const standing = getBirdApproachLimits(false)
    const distance = 0.55
    expect(distance).toBeLessThan(standing.fearDistance)
    expect(distance).toBeGreaterThan(quiet.fearDistance)
    expect(distance).toBeGreaterThan(quiet.feedingDistance)
    expect(CROUCH_WALK_SPEED).toBeLessThan(quiet.runningSpeed)
  })
  it('still frightens a bird if the crouching player gets too close', () => {
    expect(getBirdApproachLimits(true).fearDistance).toBeGreaterThan(0.3)
    expect(getBirdApproachLimits(false).fearDistance).toBe(0.82)
  })
})
