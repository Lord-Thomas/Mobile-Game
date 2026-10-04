// Stable placements: the same seed is shared by the game and the plant study.
export function seededRandom(seed = 731) {
  let value = seed >>> 0
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    return value / 4294967296
  }
}

export const LUSH_PATCH_CENTERS = [
  [-5.8, -3.6, 2.1], [-4.5, 1.2, 2.5], [-5.3, 5.5, 1.8],
  [4.7, -5.4, 2.2], [5.9, -0.2, 2.6], [4.5, 5.1, 2.2],
]

export function createLushLayout({ origin = [0, 0], seed = 731, heightAt = () => 0, canPlace = () => true } = {}) {
  const random = seededRandom(seed)
  const plants = []
  for (const [cx, cz, radius] of LUSH_PATCH_CENTERS) {
    for (let i = 0; i < 36; i++) {
      const angle = random() * Math.PI * 2
      const distance = Math.sqrt(random()) * radius
      const x = origin[0] + cx + Math.cos(angle) * distance
      const z = origin[1] + cz + Math.sin(angle) * distance
      const kind = i < 6 ? 'shrub' : i < 17 ? 'fern' : 'grass'
      const scale = kind === 'shrub' ? 0.8 + random() * 0.6 : 0.65 + random() * 0.55
      const rotation = random() * Math.PI * 2
      const tint = random()
      const clearance = kind === 'shrub' ? scale * 0.85 : scale * 0.55
      if (!canPlace(x, z, clearance)) continue
      const y = heightAt(x, z)
      if (!Number.isFinite(y)) continue
      plants.push({ kind, position: [x, y - 0.025, z], scale, rotation, tint })
    }
  }
  return plants
}
