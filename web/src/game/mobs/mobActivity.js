export const MOB_ACTIVITY_TIERS = Object.freeze({
  FULL: 'full',
  REDUCED: 'reduced',
  VISIBLE: 'visible',
  DORMANT: 'dormant',
})

export const MOB_ACTIVITY_INTERVALS = Object.freeze({
  [MOB_ACTIVITY_TIERS.FULL]: 0,
  [MOB_ACTIVITY_TIERS.REDUCED]: 1 / 10,
  [MOB_ACTIVITY_TIERS.VISIBLE]: 1 / 2,
  [MOB_ACTIVITY_TIERS.DORMANT]: Number.POSITIVE_INFINITY,
})

export const MOB_ACTIVITY_DISTANCES = Object.freeze({
  fullEnter: 32,
  fullExit: 40,
  reducedEnter: 70,
  reducedExit: 82,
  visibleEnter: 105,
  visibleExit: 120,
})

function getPosition(value) {
  const position = value?.position ?? value
  if (Array.isArray(position)) {
    const [x, y = 0, z] = position
    return Number.isFinite(x) && Number.isFinite(z) ? { x, y, z } : null
  }
  if (Number.isFinite(position?.x) && Number.isFinite(position?.z)) return position
  return null
}

export function getClosestPlayerDistanceSquared(mobPosition, players) {
  const mob = getPosition(mobPosition)
  if (!mob || !Array.isArray(players) || players.length === 0) return Number.POSITIVE_INFINITY

  let closest = Number.POSITIVE_INFINITY
  players.forEach((candidate) => {
    if (!candidate || candidate.active === false) return
    const player = getPosition(candidate)
    if (!player) return
    const dx = mob.x - player.x
    const dz = mob.z - player.z
    closest = Math.min(closest, dx * dx + dz * dz)
  })
  return closest
}

export function resolveMobActivityTier(
  currentTier,
  mobPosition,
  players,
  distances = MOB_ACTIVITY_DISTANCES,
) {
  const distanceSquared = getClosestPlayerDistanceSquared(mobPosition, players)

  if (
    currentTier === MOB_ACTIVITY_TIERS.FULL
    && distanceSquared <= distances.fullExit ** 2
  ) {
    return MOB_ACTIVITY_TIERS.FULL
  }
  if (distanceSquared <= distances.fullEnter ** 2) return MOB_ACTIVITY_TIERS.FULL

  if (
    currentTier === MOB_ACTIVITY_TIERS.REDUCED
    && distanceSquared <= distances.reducedExit ** 2
  ) {
    return MOB_ACTIVITY_TIERS.REDUCED
  }
  if (distanceSquared <= distances.reducedEnter ** 2) return MOB_ACTIVITY_TIERS.REDUCED

  if (
    currentTier === MOB_ACTIVITY_TIERS.VISIBLE
    && distanceSquared <= distances.visibleExit ** 2
  ) {
    return MOB_ACTIVITY_TIERS.VISIBLE
  }
  if (distanceSquared <= distances.visibleEnter ** 2) return MOB_ACTIVITY_TIERS.VISIBLE

  return MOB_ACTIVITY_TIERS.DORMANT
}

export function getMobActivityInterval(tier) {
  return MOB_ACTIVITY_INTERVALS[tier] ?? MOB_ACTIVITY_INTERVALS[MOB_ACTIVITY_TIERS.DORMANT]
}

export function isMobVisuallyActive(tier) {
  return tier !== MOB_ACTIVITY_TIERS.DORMANT
}
