export const MELEE_WEAPONS = Object.freeze({
  cheat_sword: Object.freeze({
    id: 'cheat_sword',
    baseDamage: 200,
    targetMultipliers: Object.freeze({ slime: 1.5 }),
    chargedMultiplier: 2.25,
    chargeThresholdMs: 700,
    maxChargeMs: 1500,
    chargedCooldownMs: 950,
  }),
})

export function getMeleeWeaponDefinition(weaponId) {
  return MELEE_WEAPONS[weaponId] ?? null
}

export function getMeleeHitDamage({
  weaponId,
  fallbackDamage = 0,
  targetTags = [],
  charged = false,
} = {}) {
  const weapon = getMeleeWeaponDefinition(weaponId)
  if (!weapon) return Math.max(0, Number(fallbackDamage) || 0)
  const targetMultiplier = targetTags.reduce(
    (multiplier, tag) => Math.max(multiplier, weapon.targetMultipliers[tag] ?? 1),
    1,
  )
  const chargedMultiplier = charged ? weapon.chargedMultiplier : 1
  return weapon.baseDamage * targetMultiplier * chargedMultiplier
}
