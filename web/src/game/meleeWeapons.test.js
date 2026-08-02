import { describe, expect, it } from 'vitest'
import { getMeleeHitDamage, getMeleeWeaponDefinition } from './meleeWeapons'

describe('meleeWeapons', () => {
  it('applique le bonus anti-slime et la charge de l’épée', () => {
    expect(getMeleeHitDamage({ weaponId: 'cheat_sword', targetTags: ['slime'] })).toBe(30)
    expect(getMeleeHitDamage({
      weaponId: 'cheat_sword',
      targetTags: ['slime'],
      charged: true,
    })).toBe(54)
  })

  it('conserve les dégâts de repli sans arme de mêlée', () => {
    expect(getMeleeHitDamage({ fallbackDamage: 15 })).toBe(15)
    expect(getMeleeWeaponDefinition('unknown')).toBeNull()
  })
  it('configure le coup tournoyant comme une attaque de zone à délai de 5 secondes', () => {
    const sword = getMeleeWeaponDefinition('cheat_sword')
    expect(sword.chargedCooldownMs).toBe(5000)
    expect(sword.chargedAreaRadius).toBeGreaterThan(0)
  })
})
