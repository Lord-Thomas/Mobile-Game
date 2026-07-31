const VALID_ZONES = new Set(['interior', 'secondRoom', 'outside'])

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function createSavedPlayerLocation({
  zone,
  position,
  rotationY = 0,
  cameraYaw = 0,
  cameraPitch = -0.22,
  cameraDistance = 4.6,
  savedAt = Date.now(),
} = {}) {
  if (!VALID_ZONES.has(zone) || !position) return null
  const values = Array.isArray(position)
    ? position
    : [position.x, position.y, position.z]
  if (!values.every((value) => Number.isFinite(Number(value)))) return null
  return {
    zone,
    position: values.map(Number),
    rotationY: finite(rotationY),
    cameraYaw: finite(cameraYaw),
    cameraPitch: clamp(finite(cameraPitch, -0.22), -0.95, 0.62),
    cameraDistance: clamp(finite(cameraDistance, 4.6), 0.85, 8.5),
    savedAt: Math.max(0, finite(savedAt, Date.now())),
  }
}

export function normalizeSavedPlayerLocation(value, { limitsByZone, fallbackSpawns } = {}) {
  const normalized = createSavedPlayerLocation(value)
  if (!normalized) return null
  const limits = limitsByZone?.[normalized.zone]
  const fallback = fallbackSpawns?.[normalized.zone]
  if (!limits || !Array.isArray(fallback)) return null
  return {
    ...normalized,
    position: [
      clamp(normalized.position[0], limits.minX, limits.maxX),
      normalized.position[1],
      clamp(normalized.position[2], limits.minZ, limits.maxZ),
    ],
  }
}
