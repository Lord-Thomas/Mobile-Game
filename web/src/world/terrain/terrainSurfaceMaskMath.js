function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function smoothstep(edge0, edge1, value) {
  if (Math.abs(edge1 - edge0) < 1e-7) return value >= edge1 ? 1 : 0
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function fract(value) {
  return value - Math.floor(value)
}

export function naturalHash(x, z) {
  return fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453123)
}

export function naturalNoise(x, z) {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = fract(x)
  const fz = fract(z)
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  const a = naturalHash(ix, iz)
  const b = naturalHash(ix + 1, iz)
  const c = naturalHash(ix, iz + 1)
  const d = naturalHash(ix + 1, iz + 1)
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uz
}

function segmentDistance(x, z, a, b) {
  const abX = b.x - a.x
  const abZ = b.z - a.z
  const lengthSq = abX * abX + abZ * abZ
  const t = lengthSq > 0
    ? clamp01(((x - a.x) * abX + (z - a.z) * abZ) / lengthSq)
    : 0
  return Math.hypot(x - (a.x + abX * t), z - (a.z + abZ * t))
}

function rectDistance(x, z, centerX, centerZ, halfWidth, halfDepth) {
  const qx = Math.abs(x - centerX) - halfWidth
  const qz = Math.abs(z - centerZ) - halfDepth
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0)
}

export function getNaturalSurfaceDirtWeight(x, z, roadPoints) {
  const edgeNoise = naturalNoise(x * 0.34, z * 0.34) * 2 - 1
  const detailNoise = naturalNoise(x * 0.83, z * 0.83) * 2 - 1
  let roadDistance = 1e6

  for (let index = 0; index < roadPoints.length - 1; index += 1) {
    roadDistance = Math.min(roadDistance, segmentDistance(x, z, roadPoints[index], roadPoints[index + 1]))
  }

  const roadShoulder = 1 - smoothstep(
    2.6 + edgeNoise * 0.22,
    4.4 + edgeNoise * 0.42,
    roadDistance,
  )
  const pathVertical = rectDistance(x, z, -6.05, 9.325, 1.35, 11.575)
  const pathHorizontal = rectDistance(x, z, -5.525, -2.25, 0.525, 1.22)
  const pathDistance = Math.min(pathVertical, pathHorizontal)
  const path = 1 - smoothstep(
    0.1 + edgeNoise * 0.14,
    1.2 + edgeNoise * 0.32,
    pathDistance,
  )
  const houseEdge = 1 - smoothstep(
    edgeNoise * 0.06,
    0.9 + edgeNoise * 0.16,
    Math.abs(rectDistance(x, z, 0, 0, 5.45, 5.45)),
  )
  const wildPatch = smoothstep(
    0.46,
    0.78,
    naturalNoise(x * 0.115 + 4.7, z * 0.115 - 2.1),
  ) * 0.24
  const drySpeckle = smoothstep(0.62, 0.92, naturalNoise(x * 1.7, z * 1.7)) * 0.08
  const dirt = Math.max(path, roadShoulder, houseEdge * 0.38, wildPatch + drySpeckle)
    + detailNoise * 0.045
  return clamp01(dirt)
}

export function getNaturalGraveyardInfluence(x, z, baseInfluence) {
  const mottledEdge = naturalNoise(x * 0.42 + 8.1, z * 0.42 - 3.7) * 0.16 - 0.05
  return clamp01(baseInfluence + mottledEdge * baseInfluence * (1 - baseInfluence))
}

export function getNaturalGraveyardNoise(x, z) {
  return {
    coarse: naturalNoise(x * 0.76 + 2.7, z * 0.76 + 9.2),
    fine: naturalNoise(x * 2.85 - 5.8, z * 2.85 + 1.9),
  }
}

export function getBiomeAreaBaseInfluence(x, z, area) {
  const dx = x - area.center[0]
  const dz = z - area.center[1]
  const innerRadius = Math.max(0, area.radius - area.feather)
  const influence = 1 - smoothstep(innerRadius, area.radius, Math.hypot(dx, dz))
  return influence * (area.groundIntensity ?? 1)
}
