// Match the two triangles of the visible terrain, rather than re-evaluating
// procedural relief for every blade (which can also bury it below the mesh).
export function createTerrainHeightSampler({ geometry, size, segments }) {
  const positions = geometry.attributes.position.array
  const stride = segments + 1
  const height = (x, z) => positions[(z * stride + x) * 3 + 1]
  return (x, z) => {
    const gx = Math.max(0, Math.min(segments, (x / size + 0.5) * segments))
    const gz = Math.max(0, Math.min(segments, (z / size + 0.5) * segments))
    const ix = Math.min(segments - 1, Math.floor(gx))
    const iz = Math.min(segments - 1, Math.floor(gz))
    const tx = gx - ix, tz = gz - iz
    const b = height(ix + 1, iz), c = height(ix, iz + 1)
    if (tx + tz <= 1) {
      return height(ix, iz) * (1 - tx - tz) + b * tx + c * tz
    }
    return b * (1 - tz) + c * (1 - tx) + height(ix + 1, iz + 1) * (tx + tz - 1)
  }
}
