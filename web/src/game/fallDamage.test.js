import { describe, expect, it } from 'vitest'
import { getFallDamage } from './fallDamage'

describe('fall damage', () => {
  it('does not hurt the player after a normal jump or a short drop', () => {
    expect(getFallDamage(2)).toBe(0)
    expect(getFallDamage(4.5)).toBe(0)
  })

  it('scales damage after the safe distance', () => {
    expect(getFallDamage(5)).toBe(6)
    expect(getFallDamage(7)).toBe(30)
  })

  it('caps lethal falls and ignores invalid distances', () => {
    expect(getFallDamage(100)).toBe(100)
    expect(getFallDamage(Number.NaN)).toBe(0)
  })
})
