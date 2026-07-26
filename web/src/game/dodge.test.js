import { describe, expect, it } from 'vitest'
import {
  PLAYER_DODGE,
  getDodgeDirection,
  getDodgeSpeed,
  isDodgeInvulnerable,
} from './dodge'

describe('dodge', () => {
  it('utilise les fenêtres de gameplay prévues', () => {
    expect(PLAYER_DODGE.duration).toBe(0.55)
    expect(PLAYER_DODGE.cooldown).toBe(0.7)
    expect(PLAYER_DODGE.inputBuffer).toBe(0.13)
    expect(PLAYER_DODGE.duration - PLAYER_DODGE.invulnerabilityEndsAt).toBeCloseTo(0.17)
  })

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

  it('conserve la vitesse d’entrée au lieu de freiner une course', () => {
    expect(getDodgeSpeed(0, 3.4)).toBeCloseTo(3.4)
    expect(getDodgeSpeed(PLAYER_DODGE.moveDelay, 3.4)).toBeCloseTo(3.4)
    expect(getDodgeSpeed(PLAYER_DODGE.moveDelay + 0.02, 3.4)).toBeGreaterThan(0)
  })

  it('parcourt environ 2,7 mètres avec la courbe de vitesse', () => {
    const movementDuration = PLAYER_DODGE.duration - PLAYER_DODGE.moveDelay
    const integratedDistance = PLAYER_DODGE.peakSpeed * movementDuration * 2 / Math.PI

    expect(integratedDistance).toBeCloseTo(2.7, 2)
  })

  it('accorde des i-frames seulement au milieu de la roulade', () => {
    expect(isDodgeInvulnerable(0.09)).toBe(false)
    expect(isDodgeInvulnerable(0.1)).toBe(true)
    expect(isDodgeInvulnerable(0.38)).toBe(true)
    expect(isDodgeInvulnerable(0.39)).toBe(false)
  })
})
