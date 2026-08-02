import { describe, expect, it } from 'vitest'
import { SLIME_BOSS } from './bossConfig'
import { normalizeBossRewards } from './bossRewards'

describe('boss rewards configured by the summoning altar', () => {
  it('uses the boss defaults for a new altar', () => {
    const altar = normalizeBossRewards()

    expect(altar.rewardCoins).toBe(SLIME_BOSS.rewards.rewardCoins)
    expect(altar.lootTable).toEqual(SLIME_BOSS.rewards.lootTable)
  })

  it('keeps an explicitly empty loot table and sanitizes edited rewards', () => {
    const empty = normalizeBossRewards({
      rewardCoins: 0,
      lootTable: [],
    })
    expect(empty.rewardCoins).toBe(0)
    expect(empty.lootTable).toEqual([])

    const edited = normalizeBossRewards({
      rewardCoins: 432.7,
      lootTable: [
        { itemId: 'blue_slime', chance: 0.6254 },
        { itemId: 'unknown_item', chance: 1 },
        { itemId: 'red_slime', chance: 3 },
      ],
    })
    expect(edited.rewardCoins).toBe(433)
    expect(edited.lootTable).toEqual([
      { itemId: 'blue_slime', chance: 0.625, quantity: 1 },
      { itemId: 'red_slime', chance: 1, quantity: 1 },
    ])
  })

  it('supports multiple copies and merges duplicate loot entries safely', () => {
    expect(normalizeBossRewards({
      lootTable: [
        { itemId: 'blue_slime', chance: 0.25, quantity: 2 },
        { itemId: 'blue_slime', chance: 0.7, quantity: 4 },
      ],
    }).lootTable).toEqual([{ itemId: 'blue_slime', chance: 0.7, quantity: 4 }])
  })
})
