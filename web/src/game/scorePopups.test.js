import { describe, expect, it } from 'vitest'
import { getNextScorePopupExpiry, pruneExpiredScorePopups } from './scorePopups'

describe('scorePopups', () => {
  it('schedules the next actual popup expiration', () => {
    expect(getNextScorePopupExpiry([])).toBeNull()
    expect(getNextScorePopupExpiry([
      { startAt: 1000, duration: 800 },
      { startAt: 1200, duration: 300 },
    ])).toBe(1500)
  })

  it('keeps the same array reference until a popup really expires', () => {
    const popups = [
      { id: 'first', startAt: 1000, duration: 500 },
      { id: 'second', startAt: 1000, duration: 1000 },
    ]

    expect(pruneExpiredScorePopups(popups, 1499)).toBe(popups)
    expect(pruneExpiredScorePopups(popups, 1500)).toEqual([
      { id: 'second', startAt: 1000, duration: 1000 },
    ])
  })
})
