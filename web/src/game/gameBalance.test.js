import { describe, expect, it } from 'vitest'
import { MAP_MONSTER_SPAWNERS } from '../world/mapObjects.generated'
import { MELEE_WEAPONS } from './meleeWeapons'

describe('game balance', () => {
  it('garde l’Épée du Roi Slime puissante sans tuer les élites en un coup', () => {
    expect(MELEE_WEAPONS.cheat_sword.name).toBe('Épée du Roi Slime')
    expect(MELEE_WEAPONS.cheat_sword.baseDamage).toBe(25)
  })

  it('limite les dégâts des slimes rouges élites', () => {
    const redSlimeSpawners = MAP_MONSTER_SPAWNERS.filter(
      (spawner) => spawner.monsterType === 'red_slime',
    )
    expect(redSlimeSpawners.length).toBeGreaterThan(0)
    expect(redSlimeSpawners.every((spawner) => spawner.attackDamage <= 20)).toBe(true)
  })
})
