import { MAP_OBJECT_CATALOG, MAP_OBJECT_PLACEMENTS } from './mapObjects'
import { SKELETON_TOWER_COLLISION } from './mapObjectCollisionData.generated'
import { getTerrainHeight } from './terrain/terrainGeometry'

const PLAYER_REFERENCE_HEIGHT_METERS = 1.63
const PLAYER_REFERENCE_HEIGHT_WORLD_UNITS = 2.25
const WORLD_UNITS_PER_METER = PLAYER_REFERENCE_HEIGHT_WORLD_UNITS / PLAYER_REFERENCE_HEIGHT_METERS

const COLLISION_BY_OBJECT_ID = {
  skeleton_tower: SKELETON_TOWER_COLLISION,
}

const MAX_STEP_UP = 0.58
const STEP_UP_BY_OBJECT_ID = {
  skeleton_tower: 1.08,
}
const WALK_SEARCH_DOWN = 3.2
const WALKABLE_TRIANGLE_TOLERANCE = 0.045
const WALKABLE_SOLID_CLEARANCE = 0.2
const LOW_SOLID_STEP_CLEARANCE_BY_OBJECT_ID = {
  skeleton_tower: 0.42,
}
const WALKABLE_SOLID_IGNORE_LOCAL_RADIUS_BY_OBJECT_ID = {
  skeleton_tower: 2.18,
}
const PLAYER_STANDING_HEIGHT = 1.72
const PLAYER_KNEE_HEIGHT = 0.18

const collisionCache = new WeakMap()

function getCollisionSource(objectId) {
  return COLLISION_BY_OBJECT_ID[objectId] ?? null
}

function getObjectTargetHeight(objectId) {
  const targetHeightMeters = MAP_OBJECT_CATALOG[objectId]?.targetHeightMeters
  return Number.isFinite(targetHeightMeters) && targetHeightMeters > 0
    ? targetHeightMeters * WORLD_UNITS_PER_METER
    : 0
}

function normalizeVertex(x, y, z, transform) {
  return [
    (x - transform.centerX) * transform.scale,
    (y - transform.minY) * transform.scale,
    (z - transform.centerZ) * transform.scale,
  ]
}

function normalizeTriangleList(triangles, transform) {
  const normalized = new Float32Array(triangles.length)

  for (let index = 0; index < triangles.length; index += 12) {
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const sourceIndex = index + vertex * 3
      const [x, y, z] = normalizeVertex(
        triangles[sourceIndex],
        triangles[sourceIndex + 1],
        triangles[sourceIndex + 2],
        transform,
      )
      normalized[sourceIndex] = x
      normalized[sourceIndex + 1] = y
      normalized[sourceIndex + 2] = z
    }

    normalized[index + 9] = triangles[index + 9] ?? 0
    normalized[index + 10] = triangles[index + 10] ?? 0
    normalized[index + 11] = triangles[index + 11] ?? 0
  }

  return normalized
}

function buildCache(objectId, source) {
  const rawVertices = source.vertices
  const indices = new Uint32Array(source.indices)
  const rawBounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  }

  for (let index = 0; index < rawVertices.length; index += 3) {
    const x = rawVertices[index]
    const y = rawVertices[index + 1]
    const z = rawVertices[index + 2]
    rawBounds.minX = Math.min(rawBounds.minX, x)
    rawBounds.maxX = Math.max(rawBounds.maxX, x)
    rawBounds.minY = Math.min(rawBounds.minY, y)
    rawBounds.maxY = Math.max(rawBounds.maxY, y)
    rawBounds.minZ = Math.min(rawBounds.minZ, z)
    rawBounds.maxZ = Math.max(rawBounds.maxZ, z)
  }

  const rawHeight = Math.max(0.001, rawBounds.maxY - rawBounds.minY)
  const targetHeight = getObjectTargetHeight(objectId)
  const modelScale = targetHeight > 0 ? targetHeight / rawHeight : 1
  const transform = {
    centerX: (rawBounds.minX + rawBounds.maxX) * 0.5,
    centerZ: (rawBounds.minZ + rawBounds.maxZ) * 0.5,
    minY: rawBounds.minY,
    scale: modelScale,
  }
  const vertices = new Float32Array(rawVertices.length)
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  }

  for (let index = 0; index < rawVertices.length; index += 3) {
    const [x, y, z] = normalizeVertex(
      rawVertices[index],
      rawVertices[index + 1],
      rawVertices[index + 2],
      transform,
    )
    vertices[index] = x
    vertices[index + 1] = y
    vertices[index + 2] = z
    bounds.minX = Math.min(bounds.minX, x)
    bounds.maxX = Math.max(bounds.maxX, x)
    bounds.minY = Math.min(bounds.minY, y)
    bounds.maxY = Math.max(bounds.maxY, y)
    bounds.minZ = Math.min(bounds.minZ, z)
    bounds.maxZ = Math.max(bounds.maxZ, z)
  }

  return {
    vertices,
    indices,
    walkTriangles: normalizeTriangleList(source.walkTriangles, transform),
    solidTriangles: normalizeTriangleList(source.solidTriangles, transform),
    bounds,
  }
}

export function getMapObjectCollisionData(objectId) {
  const source = getCollisionSource(objectId)
  if (!source) return null

  const cached = collisionCache.get(source)
  if (cached) return cached

  const next = buildCache(objectId, source)
  collisionCache.set(source, next)
  return next
}

export function getMapObjectBaseY(placement) {
  const [x = 0, savedY = 0, z = 0] = placement.position ?? []
  const terrainY = getTerrainHeight(x, z)
  return Number.isFinite(savedY) ? savedY : terrainY
}

function worldToLocalXZ(x, z, placement) {
  const [px = 0, , pz = 0] = placement.position ?? []
  const scale = placement.scale ?? 1
  const rotationY = placement.rotationY ?? 0
  const dx = x - px
  const dz = z - pz
  const cos = Math.cos(rotationY)
  const sin = Math.sin(rotationY)

  return {
    x: (dx * cos - dz * sin) / scale,
    z: (dx * sin + dz * cos) / scale,
    scale,
  }
}

function isInsideLocalBounds(localX, localZ, data, radius = 0) {
  const { bounds } = data
  return (
    localX >= bounds.minX - radius &&
    localX <= bounds.maxX + radius &&
    localZ >= bounds.minZ - radius &&
    localZ <= bounds.maxZ + radius
  )
}

function getBarycentricYOnTriangleXZ(x, z, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const v0x = bx - ax
  const v0z = bz - az
  const v1x = cx - ax
  const v1z = cz - az
  const v2x = x - ax
  const v2z = z - az
  const d00 = v0x * v0x + v0z * v0z
  const d01 = v0x * v1x + v0z * v1z
  const d11 = v1x * v1x + v1z * v1z
  const d20 = v2x * v0x + v2z * v0z
  const d21 = v2x * v1x + v2z * v1z
  const denom = d00 * d11 - d01 * d01

  if (Math.abs(denom) < 1e-7) return null

  const v = (d11 * d20 - d01 * d21) / denom
  const w = (d00 * d21 - d01 * d20) / denom
  const u = 1 - v - w
  const tolerance = 0.015

  if (u < -tolerance || v < -tolerance || w < -tolerance) return null

  return ay * u + by * v + cy * w
}

function getPlacementMaxStepUp(placement) {
  return STEP_UP_BY_OBJECT_ID[placement.objectId] ?? MAX_STEP_UP
}

function shouldIgnoreWalkableSolid(placement, localX, localZ, footY, x, z) {
  const ignoreRadius = WALKABLE_SOLID_IGNORE_LOCAL_RADIUS_BY_OBJECT_ID[placement.objectId]
  if (!ignoreRadius || Math.hypot(localX, localZ) > ignoreRadius) return false

  const walkableY = getPlacementWalkableHeight(placement, x, z, footY)
  return walkableY !== null && Math.abs(walkableY - footY) <= WALKABLE_SOLID_CLEARANCE
}

function shouldIgnoreLowStepSolid(placement, localBottom, triMaxY) {
  const clearance = LOW_SOLID_STEP_CLEARANCE_BY_OBJECT_ID[placement.objectId]
  return Number.isFinite(clearance) && triMaxY <= localBottom + clearance
}

function distanceSqToSegmentXZ(px, pz, ax, az, bx, bz) {
  const abx = bx - ax
  const abz = bz - az
  const apx = px - ax
  const apz = pz - az
  const lengthSq = abx * abx + abz * abz
  const t = lengthSq > 0 ? Math.min(1, Math.max(0, (apx * abx + apz * abz) / lengthSq)) : 0
  const cx = ax + abx * t
  const cz = az + abz * t
  const dx = px - cx
  const dz = pz - cz

  return dx * dx + dz * dz
}

function getPlacementWalkableHeight(placement, x, z, currentFootY) {
  const data = getMapObjectCollisionData(placement.objectId)
  if (!data) return null

  const { x: localX, z: localZ, scale } = worldToLocalXZ(x, z, placement)
  if (!isInsideLocalBounds(localX, localZ, data, WALKABLE_TRIANGLE_TOLERANCE)) return null

  const baseY = getMapObjectBaseY(placement)
  const maxLocalY = (currentFootY + getPlacementMaxStepUp(placement) - baseY) / scale
  const minLocalY = (currentFootY - WALK_SEARCH_DOWN - baseY) / scale
  let bestY = -Infinity
  const triangles = data.walkTriangles

  for (let index = 0; index < triangles.length; index += 12) {
    const ax = triangles[index]
    const ay = triangles[index + 1]
    const az = triangles[index + 2]
    const bx = triangles[index + 3]
    const by = triangles[index + 4]
    const bz = triangles[index + 5]
    const cx = triangles[index + 6]
    const cy = triangles[index + 7]
    const cz = triangles[index + 8]
    const triMinX = Math.min(ax, bx, cx)
    const triMaxX = Math.max(ax, bx, cx)
    const triMinZ = Math.min(az, bz, cz)
    const triMaxZ = Math.max(az, bz, cz)

    if (
      localX < triMinX - WALKABLE_TRIANGLE_TOLERANCE ||
      localX > triMaxX + WALKABLE_TRIANGLE_TOLERANCE ||
      localZ < triMinZ - WALKABLE_TRIANGLE_TOLERANCE ||
      localZ > triMaxZ + WALKABLE_TRIANGLE_TOLERANCE
    ) continue

    const y = getBarycentricYOnTriangleXZ(localX, localZ, ax, ay, az, bx, by, bz, cx, cy, cz)
    if (y === null || y > maxLocalY || y < minLocalY) continue

    bestY = Math.max(bestY, y)
  }

  return bestY === -Infinity ? null : baseY + bestY * scale
}

export function getOutdoorWalkableHeight(x, z, currentFootY, placements = MAP_OBJECT_PLACEMENTS) {
  const terrainY = getTerrainHeight(x, z)
  let bestY = terrainY
  const referenceFootY = Number.isFinite(currentFootY) ? currentFootY : terrainY

  placements.forEach((placement) => {
    const height = getPlacementWalkableHeight(placement, x, z, referenceFootY)
    if (height !== null && height > bestY) {
      bestY = height
    }
  })

  return bestY
}

export function collidesWithMapObjectSolid(x, z, footY, radius, placements = MAP_OBJECT_PLACEMENTS) {
  return placements.some((placement) => {
    const data = getMapObjectCollisionData(placement.objectId)
    if (!data) return false

    const { x: localX, z: localZ, scale } = worldToLocalXZ(x, z, placement)
    const localRadius = radius / scale
    if (!isInsideLocalBounds(localX, localZ, data, localRadius)) return false
    if (shouldIgnoreWalkableSolid(placement, localX, localZ, footY, x, z)) return false

    const baseY = getMapObjectBaseY(placement)
    const localBottom = (footY + PLAYER_KNEE_HEIGHT - baseY) / scale
    const localTop = (footY + PLAYER_STANDING_HEIGHT - baseY) / scale
    const radiusSq = localRadius * localRadius
    const triangles = data.solidTriangles

    for (let index = 0; index < triangles.length; index += 12) {
      const ax = triangles[index]
      const ay = triangles[index + 1]
      const az = triangles[index + 2]
      const bx = triangles[index + 3]
      const by = triangles[index + 4]
      const bz = triangles[index + 5]
      const cx = triangles[index + 6]
      const cy = triangles[index + 7]
      const cz = triangles[index + 8]
      const triMinY = Math.min(ay, by, cy)
      const triMaxY = Math.max(ay, by, cy)

      if (triMaxY < localBottom || triMinY > localTop) continue
      if (shouldIgnoreLowStepSolid(placement, localBottom, triMaxY)) continue

      const triMinX = Math.min(ax, bx, cx) - localRadius
      const triMaxX = Math.max(ax, bx, cx) + localRadius
      const triMinZ = Math.min(az, bz, cz) - localRadius
      const triMaxZ = Math.max(az, bz, cz) + localRadius

      if (localX < triMinX || localX > triMaxX || localZ < triMinZ || localZ > triMaxZ) continue

      if (
        distanceSqToSegmentXZ(localX, localZ, ax, az, bx, bz) <= radiusSq ||
        distanceSqToSegmentXZ(localX, localZ, bx, bz, cx, cz) <= radiusSq ||
        distanceSqToSegmentXZ(localX, localZ, cx, cz, ax, az) <= radiusSq
      ) {
        return true
      }
    }

    return false
  })
}
