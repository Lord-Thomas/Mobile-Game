// Cache the slowly varying placement density on a 0.5 m grid. Painted path
// masks and building exclusions are still evaluated at each blade's position.
export function createPlacementSampler(min, max, sample, spacing = 0.5) {
  const origin = min - 1
  const side = Math.ceil((max - min + 2) / spacing) + 1
  const cache = new Float32Array(side * side).fill(NaN)
  function offset(x, z) {
    const i = z * side + x
    if (Number.isNaN(cache[i])) {
      cache[i] = sample(origin + x * spacing, origin + z * spacing)
    }
    return i
  }
  return (x, z) => {
    const gx = Math.max(0, Math.min(side - 1, (x - origin) / spacing))
    const gz = Math.max(0, Math.min(side - 1, (z - origin) / spacing))
    const ix = Math.min(side - 2, Math.floor(gx)), iz = Math.min(side - 2, Math.floor(gz))
    const tx = gx - ix, tz = gz - iz
    const a = offset(ix, iz), b = offset(ix + 1, iz)
    const c = offset(ix, iz + 1), d = offset(ix + 1, iz + 1)
    return (cache[a] * (1 - tx) + cache[b] * tx) * (1 - tz)
      + (cache[c] * (1 - tx) + cache[d] * tx) * tz
  }
}
