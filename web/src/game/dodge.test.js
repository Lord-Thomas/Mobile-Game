import { describe, expect, it } from 'vitest'
import { PLAYER_DODGE, getDodgeDirection, getDodgeSpeed } from './dodge'

describe('dodge', () => {
  it('capture et normalise la direction actuelle du déplacement', () => {
    const direction = getDodgeDirection(3, 4, Math.PI)

    expect(direction.x).toBeCloseTo(0.6)
    expect(direction.z).toBeCloseTo(0.8)
  })

  it('roule vers l’avant du personnage sans entrée de déplacement', () => {
    const direction = getDodgeDirection(0, 0, Math.PI / 2)

    expect(direction.x).toBeCloseTo(1)
    expect(direction.z).toBeCloseTo(0)
  })

  it('attend le départ visible de l’animation puis ralentit avant sa fin', () => {
    expect(getDodgeSpeed(0)).toBe(0)
    expect(getDodgeSpeed(PLAYER_DODGE.moveDelay)).toBe(0)
    expect(getDodgeSpeed((PLAYER_DODGE.moveDelay + PLAYER_DODGE.duration) / 2))
      .toBeCloseTo(PLAYER_DODGE.peakSpeed)
    expect(getDodgeSpeed(PLAYER_DODGE.duration)).toBe(0)
  })
})
