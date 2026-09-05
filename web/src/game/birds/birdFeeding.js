export const BIRD_FOOD_DETECTION_RADIUS = 3

export function nearestBirdFood(drops, position, consumedIds, grounded) {
  if (!grounded) return null
  const available = drops.filter((drop) => !consumedIds.has(drop.id))
  let closest = null
  let distance = BIRD_FOOD_DETECTION_RADIUS
  for (const drop of available) {
    const nextDistance = Math.hypot(drop.from[0] - position.x, drop.from[2] - position.z)
    if (nextDistance < distance) {
      closest = drop
      distance = nextDistance
    }
  }
  return closest
}

export function nearestFeedingBird(positions, drops) {
  let result = null
  let distance = BIRD_FOOD_DETECTION_RADIUS
  for (const [id, { position, grounded }] of positions) {
    if (!grounded) continue
    for (const drop of drops) {
      const nextDistance = Math.hypot(drop.from[0] - position.x, drop.from[2] - position.z)
      if (nextDistance < distance) {
        distance = nextDistance
        result = id
      }
    }
  }
  return result
}
