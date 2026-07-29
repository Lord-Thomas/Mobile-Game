export const FALL_DAMAGE_SAFE_DISTANCE = 4.5
export const FALL_DAMAGE_PER_UNIT = 12
export const FALL_DAMAGE_MAX = 100

export function getFallDamage(
  fallDistance,
  {
    safeDistance = FALL_DAMAGE_SAFE_DISTANCE,
    damagePerUnit = FALL_DAMAGE_PER_UNIT,
    maxDamage = FALL_DAMAGE_MAX,
  } = {},
) {
  if (!Number.isFinite(fallDistance) || fallDistance <= safeDistance) return 0
  return Math.min(maxDamage, Math.max(1, Math.round((fallDistance - safeDistance) * damagePerUnit)))
}
