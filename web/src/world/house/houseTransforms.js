export function localHousePointToWorld(originX, originZ, rotationY, localX, localZ) {
  const cos = Math.cos(rotationY)
  const sin = Math.sin(rotationY)

  return {
    x: originX + localX * cos + localZ * sin,
    z: originZ - localX * sin + localZ * cos,
  }
}

export function worldPointToHouseLocal(originX, originZ, rotationY, worldX, worldZ) {
  const dx = worldX - originX
  const dz = worldZ - originZ
  const cos = Math.cos(rotationY)
  const sin = Math.sin(rotationY)

  return {
    x: dx * cos - dz * sin,
    z: dx * sin + dz * cos,
  }
}
