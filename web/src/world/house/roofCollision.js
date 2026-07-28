const DEFAULT_MAX_STEP_UP = 0.58
const DEFAULT_SEARCH_DOWN = 3.2
const EDGE_TOLERANCE = 0.025

function worldToRoofLocal(x, z, roof) {
  const dx = x - (roof.centerX ?? 0)
  const dz = z - (roof.centerZ ?? 0)
  const rotationY = roof.rotationY ?? 0
  const cos = Math.cos(rotationY)
  const sin = Math.sin(rotationY)

  return {
    x: dx * cos + dz * sin,
    z: -dx * sin + dz * cos,
  }
}

function isInside(value, min, max) {
  return value >= min - EDGE_TOLERANCE && value <= max + EDGE_TOLERANCE
}

export function getGableRoofSurfaceHeight(x, z, roof) {
  const local = worldToRoofLocal(x, z, roof)
  const overhangX = roof.overhangX ?? roof.overhang ?? 0.35
  const overhangZ = roof.overhangZ ?? roof.overhang ?? 0.35
  const halfWidth = roof.width * 0.5 + overhangX
  const halfDepth = roof.depth * 0.5 + overhangZ

  if (
    !isInside(local.x, -halfWidth, halfWidth) ||
    !isInside(local.z, -halfDepth, halfDepth)
  ) {
    return null
  }

  const ridgeAxis = roof.width >= roof.depth ? 'x' : 'z'
  const run = ridgeAxis === 'x' ? halfDepth : halfWidth
  const distanceFromRidge = ridgeAxis === 'x' ? Math.abs(local.z) : Math.abs(local.x)
  const ridgeRise = Math.tan(((roof.pitch ?? 32) * Math.PI) / 180) * run
  const slopeRatio = Math.max(0, 1 - distanceFromRidge / run)

  return (roof.baseY ?? 0) + roof.wallTopY + (roof.thickness ?? 0.12) + ridgeRise * slopeRatio
}

export function getLeanToRoofSurfaceHeight(x, z, roof) {
  const local = worldToRoofLocal(x, z, roof)
  const overhang = roof.overhang ?? 0.24
  const attachedOverhang = roof.overhangAttached ?? 0
  const attachSide = roof.attachSide ?? 'south'
  const minX = -roof.width * 0.5 - (attachSide === 'west' ? attachedOverhang : overhang)
  const maxX = roof.width * 0.5 + (attachSide === 'east' ? attachedOverhang : overhang)
  const minZ = -roof.depth * 0.5 - (attachSide === 'south' ? attachedOverhang : overhang)
  const maxZ = roof.depth * 0.5 + (attachSide === 'north' ? attachedOverhang : overhang)

  if (
    !isInside(local.x, minX, maxX) ||
    !isInside(local.z, minZ, maxZ)
  ) {
    return null
  }

  let slopeRatio
  if (attachSide === 'west') {
    slopeRatio = (maxX - local.x) / (maxX - minX)
  } else if (attachSide === 'east') {
    slopeRatio = (local.x - minX) / (maxX - minX)
  } else if (attachSide === 'south') {
    slopeRatio = (maxZ - local.z) / (maxZ - minZ)
  } else {
    slopeRatio = (local.z - minZ) / (maxZ - minZ)
  }

  return (roof.baseY ?? 0) + roof.wallTopY + (roof.rise ?? 0.9) * slopeRatio
}

export function getRoofSurfaceHeight(x, z, roof) {
  if (roof.type === 'lean_to') return getLeanToRoofSurfaceHeight(x, z, roof)
  if (roof.type === 'gable') return getGableRoofSurfaceHeight(x, z, roof)
  return null
}

function overlapsVerticalRange(footY, bodyHeight, bottom, top) {
  return footY < top && footY + bodyHeight > bottom
}

function collidesWithGableEnd(x, z, footY, radius, bodyHeight, roof) {
  const local = worldToRoofLocal(x, z, roof)
  const ridgeAxis = roof.width >= roof.depth ? 'x' : 'z'
  const wallThickness = roof.wallThickness ?? 0.18
  const normal = ridgeAxis === 'x' ? local.x : local.z
  const lateral = ridgeAxis === 'x' ? local.z : local.x
  const normalHalfSize = ridgeAxis === 'x' ? roof.width * 0.5 : roof.depth * 0.5
  const lateralHalfSize = ridgeAxis === 'x' ? roof.depth * 0.5 : roof.width * 0.5

  if (
    Math.abs(Math.abs(normal) - normalHalfSize) > wallThickness * 0.5 + radius ||
    Math.abs(lateral) > lateralHalfSize + wallThickness * 0.5 + radius
  ) {
    return false
  }

  const overhangRun = ridgeAxis === 'x'
    ? roof.depth * 0.5 + (roof.overhangZ ?? roof.overhang ?? 0.35)
    : roof.width * 0.5 + (roof.overhangX ?? roof.overhang ?? 0.35)
  const nearestLateral = Math.max(0, Math.abs(lateral) - radius)
  const ridgeRise = Math.tan(((roof.pitch ?? 32) * Math.PI) / 180) * overhangRun
  const top = (roof.baseY ?? 0) + roof.wallTopY
    + ridgeRise * Math.max(0, 1 - nearestLateral / overhangRun)
  const bottom = (roof.baseY ?? 0) + roof.wallTopY - 0.02

  return overlapsVerticalRange(footY, bodyHeight, bottom, top)
}

function collidesWithLeanToEnd(x, z, footY, radius, bodyHeight, roof) {
  const local = worldToRoofLocal(x, z, roof)
  const attachSide = roof.attachSide ?? 'south'
  const wallThickness = roof.wallThickness ?? 0.18
  const normalUsesX = attachSide === 'south' || attachSide === 'north'
  const normal = normalUsesX ? local.x : local.z
  const lateral = normalUsesX ? local.z : local.x
  const normalHalfSize = normalUsesX ? roof.width * 0.5 : roof.depth * 0.5
  const lateralHalfSize = normalUsesX ? roof.depth * 0.5 : roof.width * 0.5

  if (
    Math.abs(Math.abs(normal) - normalHalfSize) > wallThickness * 0.5 + radius ||
    Math.abs(lateral) > lateralHalfSize + wallThickness * 0.5 + radius
  ) {
    return false
  }

  const slopeHalfSize = normalUsesX ? roof.depth * 0.5 : roof.width * 0.5
  const clampedLateral = Math.min(slopeHalfSize, Math.max(-slopeHalfSize, lateral))
  const slopeRatio = attachSide === 'south' || attachSide === 'west'
    ? (slopeHalfSize - clampedLateral) / (slopeHalfSize * 2)
    : (clampedLateral + slopeHalfSize) / (slopeHalfSize * 2)
  const bottom = (roof.baseY ?? 0) + roof.wallTopY - 0.02
  const top = (roof.baseY ?? 0) + roof.wallTopY + (roof.rise ?? 0.9) * slopeRatio
  return overlapsVerticalRange(footY, bodyHeight, bottom, top)
}

export function collidesWithRoofStructure(
  x,
  z,
  footY,
  radius,
  bodyHeight,
  roofs,
) {
  if (!Number.isFinite(footY)) return false

  return roofs.some((roof) => {
    const surfaceHeight = getRoofSurfaceHeight(x, z, roof)
    if (
      surfaceHeight !== null &&
      footY < surfaceHeight - 0.1 &&
      footY + bodyHeight > surfaceHeight - (roof.thickness ?? 0.12) - 0.04
    ) {
      return true
    }

    if (roof.type === 'gable') {
      return collidesWithGableEnd(x, z, footY, radius, bodyHeight, roof)
    }
    if (roof.type === 'lean_to') {
      return collidesWithLeanToEnd(x, z, footY, radius, bodyHeight, roof)
    }
    return false
  })
}

export function getWalkableRoofHeight(
  x,
  z,
  currentFootY,
  roofs,
  {
    maxStepUp = DEFAULT_MAX_STEP_UP,
    searchDown = DEFAULT_SEARCH_DOWN,
  } = {},
) {
  if (!Number.isFinite(currentFootY)) return null

  let bestHeight = null

  roofs.forEach((roof) => {
    const height = getRoofSurfaceHeight(x, z, roof)
    if (
      height === null ||
      height > currentFootY + maxStepUp ||
      height < currentFootY - searchDown
    ) {
      return
    }
    bestHeight = bestHeight === null ? height : Math.max(bestHeight, height)
  })

  return bestHeight
}
