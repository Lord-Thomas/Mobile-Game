import { describe, expect, it } from 'vitest'
import { getPunchTargetAtContact } from './combatGeometry'

function target(id, x, z, radius = 0.45) {
  return {
    id,
    position: { x, y: 0, z },
    radius,
    disabled: false,
  }
}

describe('combatGeometry', () => {
  it('réacquiert une cible valide si la cible choisie au début du coup a bougé', () => {
    const targets = new Map([
      ['preferred', target('preferred', 0, -2)],
      ['replacement', target('replacement', 0.08, 1)],
    ])

    const hit = getPunchTargetAtContact({
      targets,
      preferredTargetId: 'preferred',
      playerX: 0,
      playerZ: 0,
      yaw: 0,
    })

    expect(hit?.target.id).toBe('replacement')
  })

  it('accorde à l’épée une portée modérée sans toucher derrière le joueur', () => {
    const targets = new Map([
      ['front', target('front', 0, 1.8)],
      ['back', target('back', 0, -0.5)],
    ])

    const hit = getPunchTargetAtContact({
      targets,
      playerX: 0,
      playerZ: 0,
      yaw: 0,
      rangeBonus: 0.32,
      lateralBonus: 0.12,
    })

    expect(hit?.target.id).toBe('front')
  })
})
