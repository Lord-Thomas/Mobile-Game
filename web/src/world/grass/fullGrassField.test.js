import { expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'

vi.mock('../terrain/terrainGeometry', async importOriginal => ({ ...(await importOriginal()), TERRAIN_HALF_SIZE: process.env.GRASS_FULL_WORLD_TEST ? 188 : 24 }))

it('generates a complete world field with real terrain/path masks in compact render cells', async () => {
  vi.stubGlobal('fetch', async () => {
    const bytes = await readFile(new URL('../../../public/terrain/modifications.bin', import.meta.url))
    return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
  })
  try {
    const { terrainReady, getCachedVisualGeometry } = await import('../terrain/terrainGeometry')
    await terrainReady
    const { getFullGrassField } = await import('../TerrainGroundCover')
    const pending = getFullGrassField()
    expect(getFullGrassField()).toBe(pending)
    const field = await pending
    const { createTerrainHeightSampler } = await import('./terrainHeightSampler')
    const groundHeight = createTerrainHeightSampler(getCachedVisualGeometry())
    expect(field.preparedDensity).toBe(true)
    expect(field.fields.length).toBeGreaterThan(4)
    let total = 0
    for (const { data, count, ranks, bounds } of field.fields) {
      expect(count).toBeGreaterThan(0)
      expect(ranks.length).toBe(count)
      expect(bounds.isEmpty()).toBe(false)
      expect(count * 4).toBeLessThanOrEqual(data.length)
      // Actual rendered ground, not just a finite procedural height.
      expect(data[1] - groundHeight(data[0], data[2])).toBeCloseTo(0.04, 3)
      total += count
      let valid = true
      for (let i = 0; i < count * 4; i += 4) {
        valid &&= Number.isFinite(data[i + 1]) && data[i + 3] >= 0.179 && data[i + 3] <= 0.301
      }
      expect(valid).toBe(true)
    }
    expect(total).toBeGreaterThan(1000)
    expect(await getFullGrassField()).toBe(field)
    process.stdout.write(`Full grass: ${total} tufts, ${Math.round(field.buildMs)} ms generation\n`)
  } finally { vi.unstubAllGlobals() }
}, 120000)
