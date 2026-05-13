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
