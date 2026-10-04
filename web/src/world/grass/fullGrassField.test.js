import { expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'

it('generates the complete full-density field once, with compact finite placements', async () => {
  vi.stubGlobal('fetch', async () => {
    const bytes = await readFile(new URL('../../../public/terrain/modifications.bin', import.meta.url))
    return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
  })
  try {
    const { terrainReady } = await import('../terrain/terrainGeometry')
    await terrainReady
    const { getFullGrassField } = await import('../TerrainGroundCover')
    const pending = getFullGrassField()
    expect(getFullGrassField()).toBe(pending)
    const field = await pending
    expect(field.fields).toHaveLength(4)
    let total = 0
    for (const { data, count } of field.fields) {
      expect(count).toBeGreaterThan(100000)
      expect(count * 4).toBeLessThanOrEqual(data.length)
      total += count
      let valid = true
      for (let i = 0; i < count * 4; i += 4) {
        valid &&= Number.isFinite(data[i + 1]) && data[i + 3] >= 0.179 && data[i + 3] <= 0.301
      }
      expect(valid).toBe(true)
    }
    expect(total).toBeGreaterThan(1500000)
    expect(await getFullGrassField()).toBe(field)
    process.stdout.write(`Full grass: ${total} tufts, ${Math.round(field.buildMs)} ms generation\n`)
  } finally { vi.unstubAllGlobals() }
}, 120000)
