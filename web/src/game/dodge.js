export const PLAYER_DODGE = Object.freeze({
  // Durée du clip "Sprinting Forward Roll" converti en GLB.
  duration: 1.17,
  cooldownAfter: 0.3,
  moveDelay: 0.12,
  peakSpeed: 5.3,
})

const DIRECTION_EPSILON = 0.0001

export function getDodgeDirection(moveX, moveZ, facingYaw = 0) {
  const moveLength = Math.hypot(moveX, moveZ)
  if (moveLength > DIRECTION_EPSILON) {
    return {
      x: moveX / moveLength,
      z: moveZ / moveLength,
    }
  }

  return {
    x: Math.sin(facingYaw),
    z: Math.cos(facingYaw),
  }
}

export function getDodgeSpeed(elapsed) {
  if (elapsed <= PLAYER_DODGE.moveDelay || elapsed >= PLAYER_DODGE.duration) return 0

  const movementDuration = PLAYER_DODGE.duration - PLAYER_DODGE.moveDelay
  const progress = Math.min(1, Math.max(0, (elapsed - PLAYER_DODGE.moveDelay) / movementDuration))
  return Math.sin(progress * Math.PI) * PLAYER_DODGE.peakSpeed
}
