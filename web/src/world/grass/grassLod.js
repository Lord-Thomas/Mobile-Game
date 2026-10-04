// Disjoint subsets of one placement grid. Together they reconstruct the original
// close grass exactly; distant coverage never has a separate random generator.
export const GRASS_LODS = [
  { radius: 7, fadeStart: 18, fadeEnd: 32 },
  { radius: 16, fadeStart: 48, fadeEnd: 82 },
  { radius: Infinity, fadeStart: 0, fadeEnd: 0 },
]
// Center sparse samples inside each cell to avoid double rows at chunk seams.
export function grassSampleLevel(x, z) {
  if (x % 3 !== 1 || z % 3 !== 1) return 0
  return x % 9 !== 4 || z % 9 !== 4 ? 1 : 2
}
export function grassGridAxis(min, max, step) {
  const values = []
  for (let value = min; value <= max; value += step) values.push(value)
  return values
}
export function grassLevelCapacity(step, level, chunkSize = 6) {
  const n = Math.ceil(chunkSize / step) + 1
  const middle = Math.ceil(n / 3) ** 2
  const coarse = Math.ceil(n / 9) ** 2
  // Conservative bounds include partial edge cells and floating-point endpoints.
  return level === 0 ? n * n - Math.floor(n / 3) ** 2 : level === 1 ? middle - Math.floor(n / 9) ** 2 : coarse
}
