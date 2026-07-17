import { getWallPointAt, splitWallIntoSolidRects } from '../world/house/wallUtils'

const WALL_GAP = 0.012

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
