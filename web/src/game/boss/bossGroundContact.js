export function isGroundWaveContact({
  playerCenterY,
  playerCenterToFoot,
  mountFootY,
  surfaceY,
  dodgeHeight,
}) {
  const footY = Number.isFinite(mountFootY)
    ? mountFootY
    : playerCenterY - playerCenterToFoot

  if (!Number.isFinite(footY) || !Number.isFinite(surfaceY)) return false
  return footY - surfaceY <= dodgeHeight
}
