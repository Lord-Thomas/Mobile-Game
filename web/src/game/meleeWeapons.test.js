import { describe, expect, it } from 'vitest'
import { getMeleeHitDamage, getMeleeWeaponDefinition } from './meleeWeapons'

describe('meleeWeapons', () => {
  it('applique le bonus anti-slime et la charge de l’épée', () => {
    expect(getMeleeHitDamage({ weaponId: 'cheat_sword', targetTags: ['slime'] })).toBe(300)
    expect(getMeleeHitDamage({
      weaponId: 'cheat_sword',
      targetTags: ['slime'],
      charged: true,
    })).toBe(675)
  })

  it('conserve les dégâts de repli sans arme de mêlée', () => {
    expect(getMeleeHitDamage({ fallbackDamage: 15 })).toBe(15)
    expect(getMeleeWeaponDefinition('unknown')).toBeNull()
  })
})
