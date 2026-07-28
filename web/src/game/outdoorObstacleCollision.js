export const OUTDOOR_PLAYER_COLLISION_HEIGHT = 1.72
export const MIN_TREE_TRUNK_COLLISION_RADIUS = 0.14

export function getScaledTreeTrunkCollisionRadius(trunkRadius, scale) {
  const safeRadius = Number.isFinite(trunkRadius) ? Math.max(0, trunkRadius) : 0
  const safeScale = Number.isFinite(scale) ? Math.max(0, scale) : 0
  return Math.max(MIN_TREE_TRUNK_COLLISION_RADIUS, safeRadius * safeScale * 1.08)
}

export function overlapsOutdoorColliderHeight(
  collider,
  footY,
  bodyHeight = OUTDOOR_PLAYER_COLLISION_HEIGHT,
) {
  if (
    !Number.isFinite(footY) ||
    !Number.isFinite(collider?.y) ||
    !Number.isFinite(collider?.hy)
  ) {
    return true
  }

  const colliderBottom = collider.y - collider.hy
  const colliderTop = collider.y + collider.hy
  const bodyTop = footY + Math.max(0, bodyHeight)

  return footY < colliderTop && bodyTop > colliderBottom
}
