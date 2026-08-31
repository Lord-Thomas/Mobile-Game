import { describe, expect, it } from 'vitest'
import {
  BIRD_BOND_MAX,
  BIRD_TRUST_MAX,
  adoptBird,
  gainBirdBond,
  gainBirdTrust,
  loseBirdTrust,
  normalizeBirdProgress,
} from './birdProgress'

describe('birdProgress', () => {
  it('normalizes untrusted persisted values', () => {
    expect(normalizeBirdProgress({ trust: 99, bond: 4, active: true })).toEqual({
      adopted: false,
      active: false,
      trust: BIRD_TRUST_MAX,
      bond: 0,
    })
  })

  it('requires full trust before adoption', () => {
    expect(adoptBird({ trust: 2 }).adopted).toBe(false)
    expect(adoptBird({ trust: 3 })).toEqual({ adopted: true, active: true, trust: 3, bond: 0 })
  })

  it('caps trust and bond progression', () => {
    expect(gainBirdTrust({ trust: BIRD_TRUST_MAX }).trust).toBe(BIRD_TRUST_MAX)
    expect(gainBirdBond({ adopted: true, trust: 3, bond: BIRD_BOND_MAX }).bond).toBe(BIRD_BOND_MAX)
  })

  it('loses one trust heart when a wild bird is frightened', () => {
    expect(loseBirdTrust({ trust: 2 }).trust).toBe(1)
    expect(loseBirdTrust({ trust: 0 }).trust).toBe(0)
    expect(loseBirdTrust({ adopted: true, trust: 3 }).trust).toBe(3)
  })
})
