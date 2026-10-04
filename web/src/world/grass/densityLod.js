// Fixed nested subsets: a shorter prefix never changes the surviving tufts.
export function prepareDensityBatch(batch) {
  const data = batch.data.slice(0, batch.count * 4)
  let seed = (0x12345678 ^ Math.imul(Math.round(data[0] * 1000), 73856093) ^ Math.imul(Math.round(data[2] * 1000), 19349663)) >>> 0
  for (let i = batch.count - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const j = Math.floor((seed / 4294967296) * (i + 1))
    for (let k = 0; k < 4; k++) {
      const value = data[i * 4 + k]
      data[i * 4 + k] = data[j * 4 + k]
      data[j * 4 + k] = value
    }
  }
  return { ...batch, data, ranks: Float32Array.from({ length: batch.count }, (_, i) => (i + 0.5) / batch.count) }
}

export function densityDrawCount(count, bounds, x, z) {
  const distance = Math.max(bounds.min.x - x, x - bounds.max.x, bounds.min.z - z, z - bounds.max.z, 0)
  if (distance >= 100) return 0
  return Math.min(count, Math.ceil(count * 2 ** (-Math.max(0, distance - 42) / 10)))
}

export const densityVertexDeclarations = `
attribute float instanceDensityRank;
varying float vDensityCoverage;
`
export const densityVertex = `
float densityDistance = max(abs(instancePlacement.x - uPlayerPosition.x), abs(instancePlacement.z - uPlayerPosition.z));
float densityEnd = min(100.0, 40.0 - 10.0 * log2(max(instanceDensityRank, 0.00000001)) + 2.0);
float densityStart = max(40.0, densityEnd - 4.0);
vDensityCoverage = 1.0 - smoothstep(densityStart, densityEnd, densityDistance);
`
export const densityFragment = `
// Screen-space coverage fade, without alpha blending or sorting millions of cards.
if (vDensityCoverage < 1.0) {
  float densityNoise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (vDensityCoverage <= densityNoise) discard;
}
`
