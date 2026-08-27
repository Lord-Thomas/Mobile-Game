import { getClosestPlayerDistanceSquared } from './mobActivity'

export const MOB_STREAMING_DISTANCES = Object.freeze({
  enter: 112,
  exit: 132,
})

export const MOB_STREAMING_BUDGETS = Object.freeze({
  mountsPerRefresh: 3,
  unmountsPerRefresh: 4,
})

function getSlotPosition(slot) {
  return slot?.spawnPosition ?? slot?.position ?? null
}

export function resolveMobResidentIds({
  slots,
  currentIds,
  requiredIds,
  players,
  canEvict = () => true,
  distances = MOB_STREAMING_DISTANCES,
  maxAdds = Number.POSITIVE_INFINITY,
  maxRemovals = Number.POSITIVE_INFINITY,
}) {
  const current = currentIds instanceof Set ? currentIds : new Set(currentIds)
  const required = requiredIds instanceof Set ? requiredIds : new Set(requiredIds)
  const next = new Set(required)
  const additions = []
  const removals = []

  slots.forEach((slot) => {
    if (!slot?.id || required.has(slot.id)) return
    const distanceSquared = getClosestPlayerDistanceSquared(getSlotPosition(slot), players)
    if (current.has(slot.id)) {
      next.add(slot.id)
      if (distanceSquared > distances.exit ** 2 && canEvict(slot.id)) {
        removals.push({ id: slot.id, distanceSquared })
      }
      return
    }
    if (distanceSquared <= distances.enter ** 2) additions.push({ id: slot.id, distanceSquared })
  })

  additions
    .sort((left, right) => left.distanceSquared - right.distanceSquared)
    .slice(0, maxAdds)
    .forEach(({ id }) => next.add(id))
  removals
    .sort((left, right) => right.distanceSquared - left.distanceSquared)
    .slice(0, maxRemovals)
    .forEach(({ id }) => next.delete(id))

  return next
}

export function haveSameMobIds(left, right) {
  if (left.size !== right.size) return false
  for (const id of left) {
    if (!right.has(id)) return false
  }
  return true
}
