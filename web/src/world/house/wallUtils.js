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
  const min = Math.min(wall.from, wall.to)
  const max = Math.max(wall.from, wall.to)
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
        center,
        width,
        y: wall.height * 0.5,
        height: wall.height,
      })
      continue
    }

    coveringOpenings.forEach((opening) => {
      if (opening.bottom > 0) {
        solidRects.push({
          id: `${wall.id}-${opening.id}-bottom-${index}`,
          center,
          width,
          y: opening.bottom * 0.5,
          height: opening.bottom,
        })
      }

      const topHeight = wall.height - (opening.bottom + opening.height)
      if (topHeight > 0.001) {
        solidRects.push({
          id: `${wall.id}-${opening.id}-top-${index}`,
          center,
          width,
          y: opening.bottom + opening.height + topHeight * 0.5,
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

export function getWallColliderTransform(wall, rect) {
  const x = wall.axis === 'x' ? rect.center : wall.constant
  const z = wall.axis === 'z' ? rect.center : wall.constant
  const args = wall.axis === 'x'
    ? [rect.width * 0.5, rect.height * 0.5, wall.thickness * 0.5]
    : [wall.thickness * 0.5, rect.height * 0.5, rect.width * 0.5]

  return {
    position: [x, rect.y, z],
    args,
  }
}
