import { getWallPointAt, splitWallIntoSolidRects } from '../world/house/wallUtils'

const WALL_GAP = 0.012
const CUTAWAY_CAMERA_DOT_THRESHOLD = 0.18

export function isWallCutAwayFromCamera(wall, cameraPosition) {
  const exteriorSide = wall.sideA?.type === 'outside'
    ? wall.sideA
    : wall.sideB?.type === 'outside'
      ? wall.sideB
      : null
  if (!exteriorSide) return false

  const centerX = (wall.startCorner.x + wall.endCorner.x) * 0.5
  const centerZ = (wall.startCorner.z + wall.endCorner.z) * 0.5
  return (
    exteriorSide.normal[0] * (cameraPosition.x - centerX) +
    exteriorSide.normal[2] * (cameraPosition.z - centerZ)
  ) > CUTAWAY_CAMERA_DOT_THRESHOLD
}

export function getWallMountTargets(layout, frameWidth, frameHeight) {
  return layout.walls.flatMap((wall) => (
    splitWallIntoSolidRects(wall)
      .filter((rect) => rect.width >= frameWidth && rect.height >= frameHeight)
      .flatMap((rect) => {
        const interiorSides = [wall.sideA, wall.sideB]
          .filter((side) => side?.type === 'room')

        return interiorSides.map((side, sideIndex) => ({
          id: `${rect.id}:${side.sideKey ?? sideIndex}`,
          wall,
          rect,
          side,
          normal: side.normal,
        }))
      })
  ))
}

export function getWallMountTransform(target, point, frameWidth, frameHeight, frameDepth) {
  const { wall, rect, normal } = target
  const directionX = (wall.endCorner.x - wall.startCorner.x) / wall.length
  const directionZ = (wall.endCorner.z - wall.startCorner.z) / wall.length
  const pointerDistance = (
    (point.x - wall.startCorner.x) * directionX +
    (point.z - wall.startCorner.z) * directionZ
  )
  const halfWidth = frameWidth * 0.5
  const distance = Math.min(rect.end - halfWidth, Math.max(rect.start + halfWidth, pointerDistance))
  const halfHeight = frameHeight * 0.5
  const y = Math.min(
    rect.y + rect.height * 0.5 - halfHeight,
    Math.max(rect.y - rect.height * 0.5 + halfHeight, point.y),
  )
  const wallPoint = getWallPointAt(wall, distance)
  const offset = wall.thickness * 0.5 + frameDepth * 0.5 + WALL_GAP
  let rotationY = 0
  if (normal[0] > 0) rotationY = Math.PI / 2
  if (normal[0] < 0) rotationY = -Math.PI / 2
  if (normal[2] < 0) rotationY = Math.PI

  return {
    position: [
      wallPoint.x + normal[0] * offset,
      y,
      wallPoint.z + normal[2] * offset,
    ],
    rotationY,
    wallId: wall.id,
  }
}

export function getClosestWallMountTransform(targets, point, frameWidth, frameHeight, frameDepth, preferredWallId = null) {
  let best = null

  targets.forEach((target) => {
    const transform = getWallMountTransform(target, point, frameWidth, frameHeight, frameDepth)
    const dx = transform.position[0] - point.x
    const dz = transform.position[2] - point.z
    const score = dx * dx + dz * dz - (target.wall.id === preferredWallId ? 0.0001 : 0)
    if (!best || score < best.score) best = { score, transform }
  })

  return best?.transform ?? null
}

export function getWallMountTransformFromRay(targets, ray, frameWidth, frameHeight, frameDepth, preferredWallId = null) {
  let best = null

  targets.forEach((target) => {
    const { wall, rect, normal } = target
    const planePoint = getWallPointAt(wall, rect.center)
    const planeOffset = wall.thickness * 0.5
    planePoint.x += normal[0] * planeOffset
    planePoint.z += normal[2] * planeOffset
    const denominator = ray.direction.x * normal[0] + ray.direction.z * normal[2]
    if (Math.abs(denominator) < 0.0001) return

    const distance = (
      (planePoint.x - ray.origin.x) * normal[0] +
      (planePoint.z - ray.origin.z) * normal[2]
    ) / denominator
    if (distance <= 0) return

    const point = {
      x: ray.origin.x + ray.direction.x * distance,
      y: ray.origin.y + ray.direction.y * distance,
      z: ray.origin.z + ray.direction.z * distance,
    }
    const transform = getWallMountTransform(target, point, frameWidth, frameHeight, frameDepth)
    const missX = transform.position[0] - point.x
    const missY = transform.position[1] - point.y
    const missZ = transform.position[2] - point.z
    const aimMiss = Math.hypot(missX, missY, missZ)
    const score = distance + aimMiss * 12 - (wall.id === preferredWallId ? 0.0001 : 0)
    if (!best || score < best.score) best = { score, transform }
  })

  return best?.transform ?? null
}
