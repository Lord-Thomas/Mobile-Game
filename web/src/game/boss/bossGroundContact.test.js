import { describe, expect, it } from 'vitest'
import { isGroundWaveContact } from './bossGroundContact'

const base = {
  playerCenterY: 0.42,
  playerCenterToFoot: 0.42,
  mountFootY: null,
  surfaceY: 0,
  dodgeHeight: 0.32,
}

describe('isGroundWaveContact', () => {
  it('touche un joueur au sol ou sur une surface surélevée', () => {
    expect(isGroundWaveContact(base)).toBe(true)
    expect(isGroundWaveContact({
      ...base,
      playerCenterY: 1.12,
      surfaceY: 0.7,
    })).toBe(true)
  })

  it('utilise les pieds de la monture plutôt que la hauteur de la selle', () => {
    expect(isGroundWaveContact({
      ...base,
      playerCenterY: 2.4,
      mountFootY: 0.7,
      surfaceY: 0.7,
    })).toBe(true)
  })

  it('laisse un saut ou une monture volante passer au-dessus de l’onde', () => {
    expect(isGroundWaveContact({
      ...base,
      playerCenterY: 0.82,
    })).toBe(false)
    expect(isGroundWaveContact({
      ...base,
      playerCenterY: 1.5,
    })).toBe(false)
    expect(isGroundWaveContact({
      ...base,
      playerCenterY: 4,
      mountFootY: 3,
    })).toBe(false)
  })
})
