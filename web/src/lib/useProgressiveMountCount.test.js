import { describe, expect, it } from 'vitest'
import { getProgressiveMountStartingCount } from './useProgressiveMountCount'

describe('getProgressiveMountStartingCount', () => {
  it('publie le premier lot quand une collection vide reçoit un ou deux objets', () => {
    expect(getProgressiveMountStartingCount(0, 1, 2)).toBe(1)
    expect(getProgressiveMountStartingCount(0, 2, 2)).toBe(2)
  })

  it('conserve une progression existante et la borne si la collection rétrécit', () => {
    expect(getProgressiveMountStartingCount(4, 8, 2)).toBe(4)
    expect(getProgressiveMountStartingCount(4, 1, 2)).toBe(1)
  })
})
