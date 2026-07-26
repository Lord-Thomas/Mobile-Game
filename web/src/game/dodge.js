const DODGE_DURATION = 0.55
const DODGE_MOVE_DELAY = 0.06
const DODGE_DISTANCE = 2.7

export const PLAYER_DODGE = Object.freeze({
  duration: DODGE_DURATION,
  distance: DODGE_DISTANCE,
  cooldown: 0.7,
  inputBuffer: 0.13,
  invulnerabilityStartsAt: 0.1,
  invulnerabilityEndsAt: 0.38,
  moveDelay: DODGE_MOVE_DELAY,
  peakSpeed: DODGE_DISTANCE * Math.PI / (2 * (DODGE_DURATION - DODGE_MOVE_DELAY)),
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

export function getDodgeSpeed(elapsed, entrySpeed = 0) {
  if (elapsed < 0 || elapsed >= PLAYER_DODGE.duration) return 0

  const carriedSpeed = Math.max(0, Number(entrySpeed) || 0)
  if (elapsed <= PLAYER_DODGE.moveDelay) return carriedSpeed

  const movementDuration = PLAYER_DODGE.duration - PLAYER_DODGE.moveDelay
  const progress = Math.min(1, Math.max(0, (elapsed - PLAYER_DODGE.moveDelay) / movementDuration))
  const rollSpeed = Math.sin(progress * Math.PI) * PLAYER_DODGE.peakSpeed
  const fadingEntrySpeed = carriedSpeed * (1 - progress)
  return Math.max(rollSpeed, fadingEntrySpeed)
}

export function isDodgeInvulnerable(elapsed) {
  return (
    elapsed >= PLAYER_DODGE.invulnerabilityStartsAt &&
    elapsed <= PLAYER_DODGE.invulnerabilityEndsAt
  )
}
