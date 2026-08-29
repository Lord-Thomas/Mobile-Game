function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

export function accumulatePendingCameraDrag(touch, deltaX, deltaY) {
  if (!touch) return
  touch.lookDeltaX = finite(touch.lookDeltaX) + finite(deltaX)
  touch.lookDeltaY = finite(touch.lookDeltaY) + finite(deltaY)
}

export function clearPendingCameraDrag(touch) {
  if (!touch) return
  touch.lookDeltaX = 0
  touch.lookDeltaY = 0
}

export function consumePendingCameraDrag(touch, { sensitivity, minPitch, maxPitch } = {}) {
  if (!touch) return null

  const deltaX = finite(touch.lookDeltaX)
  const deltaY = finite(touch.lookDeltaY)
  clearPendingCameraDrag(touch)
  if (deltaX === 0 && deltaY === 0) return null

  const safeSensitivity = finite(sensitivity)
  const yawDelta = -deltaX * safeSensitivity
  const pitchDelta = deltaY * safeSensitivity
  const unclampedPitch = finite(touch.cameraPitch) + pitchDelta
  const lowerPitch = finite(minPitch, -Infinity)
  const upperPitch = finite(maxPitch, Infinity)

  touch.cameraYaw = finite(touch.cameraYaw) + yawDelta
  touch.cameraPitch = Math.min(upperPitch, Math.max(lowerPitch, unclampedPitch))

  return {
    deltaX,
    deltaY,
    magnitude: Math.hypot(deltaX, deltaY),
    yawDelta,
    pitchDelta,
  }
}
