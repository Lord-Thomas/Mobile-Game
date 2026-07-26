import { describe, expect, it } from 'vitest'
import { ATTACK_TYPE, isDamageIgnoredByDodge } from './damageTypes'

describe('damageTypes', () => {
  it('ignore seulement une attaque esquivable pendant les i-frames', () => {
    expect(isDamageIgnoredByDodge(ATTACK_TYPE.DODGEABLE, true)).toBe(true)
    expect(isDamageIgnoredByDodge(ATTACK_TYPE.GROUND_WAVE, true)).toBe(false)
    expect(isDamageIgnoredByDodge(ATTACK_TYPE.PERSISTENT_AREA, true)).toBe(false)
  })

  it('reste vulnérable hors de la fenêtre des i-frames', () => {
    expect(isDamageIgnoredByDodge(ATTACK_TYPE.DODGEABLE, false)).toBe(false)
  })
})
