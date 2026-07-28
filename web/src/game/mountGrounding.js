export const MOUNT_AIRBORNE_THRESHOLD = 0.05

export function rebaseMountAltitudeForSurface({
  currentGroundY,
  nextGroundY,
  currentAltitude,
  nextAltitude,
  canFly,
  ledgeDrop,
}) {
  if (
    !canFly ||
    (
      currentAltitude <= MOUNT_AIRBORNE_THRESHOLD &&
      currentGroundY - nextGroundY <= ledgeDrop
    )
  ) {
    return nextAltitude
  }

  const desiredWorldY = currentGroundY + nextAltitude
  return Math.max(0, desiredWorldY - nextGroundY)
}
