import { ALL_ITEM_IDS } from '../../items/itemDefinitions'
import { SLIME_BOSS } from './bossConfig'

const VALID_LOOT_ITEM_IDS = new Set(ALL_ITEM_IDS)

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function normalizeBossRewards(rewards = {}) {
  const rawCoins = Number(rewards?.rewardCoins)
  const rewardCoins = Math.round(clamp(
    Number.isFinite(rawCoins) ? rawCoins : SLIME_BOSS.rewards.rewardCoins,
    0,
    100000,
  ))
  const sourceLoot = Array.isArray(rewards?.lootTable)
    ? rewards.lootTable
    : SLIME_BOSS.rewards.lootTable
  const merged = new Map()

  sourceLoot.forEach((entry) => {
    if (!VALID_LOOT_ITEM_IDS.has(entry?.itemId)) return
    const rawChance = Number(entry.chance)
    if (!Number.isFinite(rawChance)) return
    const chance = clamp(rawChance, 0, 1)
    if (chance <= 0) return
    const rawQuantity = Number(entry.quantity)
    const quantity = Math.round(clamp(Number.isFinite(rawQuantity) ? rawQuantity : 1, 1, 99))
    const previous = merged.get(entry.itemId)
    merged.set(entry.itemId, {
      chance: Math.max(previous?.chance ?? 0, chance),
      quantity: Math.max(previous?.quantity ?? 1, quantity),
    })
  })

  return {
    rewardCoins,
    lootTable: [...merged.entries()].map(([itemId, entry]) => ({
      itemId,
      chance: Math.round(entry.chance * 1000) / 1000,
      quantity: entry.quantity,
    })),
  }
}
