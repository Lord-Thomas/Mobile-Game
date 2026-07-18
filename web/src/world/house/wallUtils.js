export function getWallOpeningLayout(wallWidth, wallHeight, opening) {
  const halfWallWidth = wallWidth * 0.5
  const halfOpeningWidth = opening.width * 0.5
  const leftWidth = Math.max(0, halfWallWidth - halfOpeningWidth)
  const rightWidth = leftWidth
  const bottomY = opening.bottomY ?? 0
  const topHeight = Math.max(0, wallHeight - (bottomY + opening.height))

  return {
    left: {
      width: leftWidth,
      x: opening.centerX - halfOpeningWidth - leftWidth * 0.5,
      y: wallHeight * 0.5,
      height: wallHeight,
    },
    right: {
      width: rightWidth,
      x: opening.centerX + halfOpeningWidth + rightWidth * 0.5,
      y: wallHeight * 0.5,
      height: wallHeight,
    },
    top: {
      width: opening.width,
      x: opening.centerX,
      y: bottomY + opening.height + topHeight * 0.5,
      height: topHeight,
    },
  }
}

export function splitWallIntoSolidRects(wall) {
  const min = 0
  const max = wall.length ?? Math.abs(wall.to - wall.from)
  const wallBottom = wall.bottom ?? wall.bottomY ?? 0
  const openings = [...(wall.openings ?? [])]
    .map((opening) => ({
      ...opening,
      min: opening.center - opening.width * 0.5,
      max: opening.center + opening.width * 0.5,
      bottom: opening.bottom ?? opening.bottomY ?? 0,
    }))
    .sort((a, b) => a.min - b.min)

  const cuts = [min, max]
  openings.forEach((opening) => {
    cuts.push(Math.max(min, opening.min), Math.min(max, opening.max))
  })
  const sortedCuts = [...new Set(cuts)]
    .filter((value) => value >= min && value <= max)
    .sort((a, b) => a - b)

  const solidRects = []

  for (let index = 0; index < sortedCuts.length - 1; index += 1) {
    const start = sortedCuts[index]
    const end = sortedCuts[index + 1]
    const width = end - start
    if (width <= 0.001) continue

    const center = (start + end) * 0.5
    const coveringOpenings = openings.filter((opening) => (
      center > opening.min && center < opening.max
    ))

    if (!coveringOpenings.length) {
      solidRects.push({
        id: `${wall.id}-solid-${index}`,
        start,
        end,
        center,
        width,
        y: wallBottom + wall.height * 0.5,
        height: wall.height,
      })
      continue
    }

    coveringOpenings.forEach((opening) => {
      if (opening.bottom > 0) {
        solidRects.push({
          id: `${wall.id}-${opening.id}-bottom-${index}`,
          start,
          end,
          center,
          width,
          y: wallBottom + opening.bottom * 0.5,
          height: opening.bottom,
        })
      }

      const topHeight = wall.height - (opening.bottom + opening.height)
      if (topHeight > 0.001) {
        solidRects.push({
          id: `${wall.id}-${opening.id}-top-${index}`,
          start,
          end,
          center,
          width,
          y: wallBottom + opening.bottom + opening.height + topHeight * 0.5,
          height: topHeight,
        })
      }
    })
  }

  return solidRects
}

export function getWallSideTransform(wall, rect, side) {
  const offset = wall.thickness * 0.5 + 0.006
  const normal = side.normal
  const x = wall.axis === 'x'
    ? rect.center
    : wall.constant + normal[0] * offset
  const z = wall.axis === 'z'
    ? rect.center
    : wall.constant + normal[2] * offset
  let rotationY = 0

  if (normal[0] > 0) rotationY = Math.PI / 2
  if (normal[0] < 0) rotationY = -Math.PI / 2
  if (normal[2] < 0) rotationY = Math.PI

  return {
    position: [x, rect.y, z],
    rotation: [0, rotationY, 0],
    width: rect.width,
    height: rect.height,
  }
}

export function getWallDirection(wall) {
  const dx = wall.endCorner.x - wall.startCorner.x
  const dz = wall.endCorner.z - wall.startCorner.z
  const length = Math.hypot(dx, dz) || 1

  return {
    x: dx / length,
    z: dz / length,
    length,
  }
}

export function getWallPointAt(wall, distance) {
  const direction = getWallDirection(wall)
  return {
    x: wall.startCorner.x + direction.x * distance,
    z: wall.startCorner.z + direction.z * distance,
  }
}

export function getWallColliderTransform(wall, rect, {
  extendJoints = true,
  startExtension = null,
  endExtension = null,
} = {}) {
  const direction = getWallDirection(wall)
  const jointExtension = wall.thickness * 0.5
  const rectStart = Number.isFinite(rect.start) ? rect.start : rect.center - rect.width * 0.5
  const rectEnd = Number.isFinite(rect.end) ? rect.end : rect.center + rect.width * 0.5
  // Les prolongements assurent que les colliders de deux murs qui se joignent
  // ne laissent aucun interstice. Ils ne doivent pas être utilisés pour le
  // rendu : les deux volumes se croisent dans les angles et leurs textures se
  // superposent alors visuellement.
  const resolvedStartExtension = Number.isFinite(startExtension)
    ? startExtension
    : (extendJoints && rectStart <= 0.0001 ? jointExtension : 0)
  const resolvedEndExtension = Number.isFinite(endExtension)
    ? endExtension
    : (extendJoints && rectEnd >= direction.length - 0.0001 ? jointExtension : 0)
  const extendedStart = Math.max(-jointExtension, rectStart - resolvedStartExtension)
  const extendedEnd = Math.min(direction.length + jointExtension, rectEnd + resolvedEndExtension)
  const extendedWidth = extendedEnd - extendedStart
  const center = getWallPointAt(wall, (extendedStart + extendedEnd) * 0.5)
  const rotationY = Math.atan2(direction.z, direction.x)

  return {
    position: [center.x, rect.y, center.z],
    rotation: [0, -rotationY, 0],
    args: [extendedWidth * 0.5, rect.height * 0.5, wall.thickness * 0.5],
    renderWidth: extendedWidth,
  }
}

function cornersMatch(left, right) {
  return Math.abs(left.x - right.x) < 0.001 && Math.abs(left.z - right.z) < 0.001
}

// Au rendu, une jonction perpendiculaire reste fermée, tandis que deux
// segments alignés ne se chevauchent jamais. Cela évite le z-fighting des
// textures sans laisser de trou dans un angle.
export function getWallRenderTransform(wall, rect, walls = []) {
  const direction = getWallDirection(wall)
  const rectStart = Number.isFinite(rect.start) ? rect.start : rect.center - rect.width * 0.5
  const rectEnd = Number.isFinite(rect.end) ? rect.end : rect.center + rect.width * 0.5
  const jointExtension = wall.thickness * 0.5
  const getJointExtension = (corner) => {
    const connections = walls.filter((candidate) => (
      candidate.id !== wall.id &&
      (cornersMatch(candidate.startCorner, corner) || cornersMatch(candidate.endCorner, corner))
    ))
    const directions = connections.map(getWallDirection)
    const hasCollinearContinuation = directions.some((otherDirection) => (
      Math.abs(direction.x * otherDirection.z - direction.z * otherDirection.x) <= 0.001
    ))
    const perpendicularCount = directions.filter((otherDirection) => (
      Math.abs(direction.x * otherDirection.z - direction.z * otherDirection.x) > 0.001
    )).length

    // Jonction en T : les deux segments du mur principal restent bord à bord.
    // La cloison qui arrive perpendiculairement s'arrête contre leur face au
    // lieu de traverser le volume, ce qui supprimme la texture visible par
    // transparence au point de raccord.
    if (hasCollinearContinuation) return 0
    if (perpendicularCount >= 2) return -jointExtension
    return perpendicularCount === 1 ? jointExtension : 0
  }
  const startExtension = rectStart <= 0.0001 ? getJointExtension(wall.startCorner) : 0
  const endExtension = rectEnd >= direction.length - 0.0001 ? getJointExtension(wall.endCorner) : 0

  return getWallColliderTransform(wall, rect, {
    extendJoints: false,
    startExtension,
    endExtension,
  })
}

export function getWallFootprint(wall) {
  const direction = getWallDirection(wall)
  const normal = { x: -direction.z, z: direction.x }
  const halfThickness = wall.thickness * 0.5
  const start = wall.startCorner
  const end = wall.endCorner

  return [
    { x: start.x + normal.x * halfThickness, z: start.z + normal.z * halfThickness },
    { x: end.x + normal.x * halfThickness, z: end.z + normal.z * halfThickness },
    { x: end.x - normal.x * halfThickness, z: end.z - normal.z * halfThickness },
    { x: start.x - normal.x * halfThickness, z: start.z - normal.z * halfThickness },
  ]
}
