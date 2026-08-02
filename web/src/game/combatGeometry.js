// Maths pures de contact/collision pour le combat (coups de pied, poings, cadre de but).
// Extraites de App.jsx ; aucune dépendance React/Three, juste de la géométrie.

import {
  BALL_RADIUS,
  GOAL_Z,
  PLAYER_CAPSULE_RADIUS,
  PLAYER_KICK_FOOT_CONTACT_RADIUS,
  PLAYER_KICK_FOOT_FORWARD_OFFSET,
  PLAYER_KICK_FOOT_SIDE_OFFSET,
  PLAYER_KICK_FRONT_MIN,
  PLAYER_KICK_LATERAL_RANGE,
  PLAYER_KICK_RANGE,
  PLAYER_PUNCH_FRONT_MIN,
  PLAYER_PUNCH_LATERAL_RANGE,
  PLAYER_PUNCH_RANGE,
} from './constants'

export function intersectsAabbSphere(px, py, pz, radius, cx, cy, cz, hx, hy, hz) {
  const dx = Math.max(Math.abs(px - cx) - hx, 0)
  const dy = Math.max(Math.abs(py - cy) - hy, 0)
  const dz = Math.max(Math.abs(pz - cz) - hz, 0)
  return dx * dx + dy * dy + dz * dz <= radius * radius
}

export function collidesWithGoalFrame(nextX, nextY, nextZ, goalObject) {
  const goalX = goalObject?.position?.[0] ?? 0
  const goalZ = goalObject?.position?.[2] ?? GOAL_Z
  const goalRotationY = goalObject?.rotationY ?? 0
  const dx = nextX - goalX
  const dz = nextZ - goalZ
  const cos = Math.cos(goalRotationY)
  const sin = Math.sin(goalRotationY)
  const localX = dx * cos - dz * sin
  const localZ = dx * sin + dz * cos
  const r = PLAYER_CAPSULE_RADIUS
  const hitLeftPost = intersectsAabbSphere(localX, nextY, localZ, r, -1.5, 1, 0, 0.11, 1, 0.11)
  const hitRightPost = intersectsAabbSphere(localX, nextY, localZ, r, 1.5, 1, 0, 0.11, 1, 0.11)
  const hitCrossbar = intersectsAabbSphere(localX, nextY, localZ, r, 0, 2, 0, 1.58, 0.11, 0.11)
  // Keep only frame collision for player to avoid "phantom blocks" inside the goal volume.
  return hitLeftPost || hitRightPost || hitCrossbar
}

export function getKickContact({ playerX, playerZ, yaw, ballX, ballZ }) {
  const forwardX = Math.sin(yaw)
  const forwardZ = Math.cos(yaw)
  const rightX = Math.cos(yaw)
  const rightZ = -Math.sin(yaw)
  const dx = ballX - playerX
  const dz = ballZ - playerZ
  const forwardDistance = dx * forwardX + dz * forwardZ
  const lateralDistance = dx * rightX + dz * rightZ
  const footX =
    playerX +
    forwardX * PLAYER_KICK_FOOT_FORWARD_OFFSET +
    rightX * PLAYER_KICK_FOOT_SIDE_OFFSET
  const footZ =
    playerZ +
    forwardZ * PLAYER_KICK_FOOT_FORWARD_OFFSET +
    rightZ * PLAYER_KICK_FOOT_SIDE_OFFSET
  const distanceToFoot = Math.hypot(ballX - footX, ballZ - footZ)

  return {
    forwardX,
    forwardZ,
    isInKickArc:
      forwardDistance > PLAYER_KICK_FRONT_MIN &&
      forwardDistance < PLAYER_KICK_RANGE &&
      Math.abs(lateralDistance) < PLAYER_KICK_LATERAL_RANGE,
    isTouchingFoot: distanceToFoot < PLAYER_KICK_FOOT_CONTACT_RADIUS + BALL_RADIUS,
  }
}

export function getPunchContact({
  playerX,
  playerZ,
  yaw,
  targetX,
  targetZ,
  targetRadius = 0.45,
  rangeBonus = 0,
  lateralBonus = 0,
}) {
  const forwardX = Math.sin(yaw)
  const forwardZ = Math.cos(yaw)
  const rightX = Math.cos(yaw)
  const rightZ = -Math.sin(yaw)
  const dx = targetX - playerX
  const dz = targetZ - playerZ
  const forwardDistance = dx * forwardX + dz * forwardZ
  const lateralDistance = dx * rightX + dz * rightZ

  return {
    forwardX,
    forwardZ,
    forwardDistance,
    lateralDistance,
    isInPunchArc:
      forwardDistance > PLAYER_PUNCH_FRONT_MIN &&
      forwardDistance < PLAYER_PUNCH_RANGE + targetRadius + rangeBonus &&
      Math.abs(lateralDistance) < PLAYER_PUNCH_LATERAL_RANGE + targetRadius + lateralBonus,
  }
}

export function getNearestPunchTarget({
  targets,
  playerX,
  playerZ,
  yaw,
  rangeBonus = 0,
  lateralBonus = 0,
}) {
  let nearest = null
  let nearestDistance = Infinity

  targets?.forEach((target) => {
    if (!target || target.disabled) return
    const position = target.position
    if (!position) return

    const contact = getPunchContact({
      playerX,
      playerZ,
      yaw,
      targetX: position.x,
      targetZ: position.z,
      targetRadius: target.radius,
      rangeBonus,
      lateralBonus,
    })

    if (!contact.isInPunchArc || contact.forwardDistance >= nearestDistance) return
    nearestDistance = contact.forwardDistance
    nearest = { target, contact }
  })

  return nearest
}

export function getPunchTargetAtContact({
  targets,
  preferredTargetId = null,
  playerX,
  playerZ,
  yaw,
  rangeBonus = 0,
  lateralBonus = 0,
}) {
  const preferred = preferredTargetId ? targets?.get?.(preferredTargetId) : null
  if (preferred && !preferred.disabled && preferred.position) {
    const contact = getPunchContact({
      playerX,
      playerZ,
      yaw,
      targetX: preferred.position.x,
      targetZ: preferred.position.z,
      targetRadius: preferred.radius,
      rangeBonus,
      lateralBonus,
    })
    if (contact.isInPunchArc) return { target: preferred, contact }
  }

  return getNearestPunchTarget({
    targets,
    playerX,
    playerZ,
    yaw,
    rangeBonus,
    lateralBonus,
  })
}

export function getMeleeAreaTargets({ targets, playerX, playerZ, radius }) {
  const hits = []
  const safeRadius = Math.max(0, Number(radius) || 0)
  targets?.forEach?.((target) => {
    if (!target || target.disabled || !target.position) return
    const dx = target.position.x - playerX
    const dz = target.position.z - playerZ
    const distance = Math.hypot(dx, dz)
    if (distance > safeRadius + Math.max(0, Number(target.radius) || 0)) return
    hits.push({ target, distance, dx, dz })
  })
  return hits.sort((left, right) => left.distance - right.distance)
}
