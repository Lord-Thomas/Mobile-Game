import { expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createStreamedField } from './streamedField'

it('streams the real exterior with ground-aligned blades, precise masks and bounded storage', async () => {
  vi.stubGlobal('fetch', async () => {
    const bytes = await readFile(new URL('../../../public/terrain/modifications.bin', import.meta.url))
    return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
  })
  try {
    const terrain = await import('../terrain/terrainGeometry')
    await terrain.terrainReady
    const { createOutdoorGrassSurface } = await import('./outdoorGrassSurface')
    const { createTerrainHeightSampler } = await import('./terrainHeightSampler')
    const { isInsideHouseFootprint } = await import('../worldZones')
    const { MAP_PATH_SURFACE_SAMPLER } = await import('../paths')
    const { getBiomeInfluence } = await import('../biomeAreas')
    const surface = createOutdoorGrassSurface()
    const sampleHeight = createTerrainHeightSampler(terrain.getCachedVisualGeometry())
    const field = createStreamedField(5, terrain.TERRAIN_VISUAL_SIZE, surface)
    field.target(0, 0)
    const start = performance.now()
    while (field.stats().pending) field.step(Infinity, 1000)
    let checked = 0
    for (const slot of field.slots) {
      if (!slot.count) continue
      expect(slot.ranks[slot.count - 1]).toBeCloseTo((slot.count - 0.5) / slot.count)
      for (let i = 0; i < slot.count; i += 79) {
        const x = slot.cx * 8 + slot.data[i * 4], z = slot.cz * 8 + slot.data[i * 4 + 2]
        const y = slot.data[i * 4 + 1]
        expect(y - sampleHeight(x, z)).toBeCloseTo(0.04, 3)
        expect(y).toBeGreaterThan(slot.bounds.min.y)
        expect(y).toBeLessThan(slot.bounds.max.y)
        expect(isInsideHouseFootprint(x, z, 0.89)).toBe(false)
        expect(getBiomeInfluence('graveyard', x, z, null)).toBeLessThanOrEqual(0.2801)
        const masks = MAP_PATH_SURFACE_SAMPLER.sampleGrassWeights(x, z)
        expect(masks.naturalWeight + masks.grassWeight).toBeGreaterThan(0)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(1000)
    expect(field.stats().loaded).toBe(961)
    expect(field.stats().count).toBeGreaterThan(1_000_000)
    const buffers = field.slots.map(slot => slot.data)
    field.target(160, 160)
    while (field.stats().pending) field.step(Infinity, 1000)
    expect(field.slots.every((slot, i) => slot.data === buffers[i])).toBe(true)
    process.stdout.write(`Outdoor stream: ${checked} samples checked, ${Math.round(performance.now() - start)} ms including travel\n`)
  } finally { vi.unstubAllGlobals() }
}, 120000)
