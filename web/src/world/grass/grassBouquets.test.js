import { describe, expect, it } from 'vitest'
import { PlaneGeometry, Float32BufferAttribute } from 'three'
import { addBouquetRows, BOUQUET_ROWS, bouquetWeights } from './grassBouquets'

describe('fine tuft bouquets', () => {
  it.each([0, 1, 2])('preserves the original card and bounds geometry for tier %s', level => {
    const base = new PlaneGeometry(1.08, 0.78)
    const positions = [...base.attributes.position.array]
    const uvs = [...base.attributes.uv.array]
    const g = addBouquetRows(base, level, Float32BufferAttribute)
    expect([...g.attributes.position.array.slice(0, positions.length)]).toEqual(positions)
    expect([...g.attributes.uv.array.slice(0, uvs.length)]).toEqual(uvs)
    expect(g.index.count).toBe(6 * BOUQUET_ROWS[level])
    expect([...g.index.array].every(i => i < g.attributes.position.count)).toBe(true)
    const rows = new Set(g.attributes.grassRow.array)
    expect(rows.has(0)).toBe(true)
    for (const row of rows) expect(rows.has(-row)).toBe(true)
    g.dispose()
  })
  it('conserves represented density throughout both overlapping transitions', () => {
    for (let f = 0; f <= 1; f += 0.1) for (let m = 0; m <= 1; m += 0.1) {
      const mid = bouquetWeights(f, m, 1), far = bouquetWeights(f, m, 2)
      const coverage = 8 / 9 * f + 8 / 81 * m * mid.columns * mid.rows + 1 / 81 * far.columns * far.rows
      expect(coverage).toBeCloseTo(1, 10)
    }
  })
  it('replaces sparse tiers with 9 and 81 original-width tufts', () => {
    expect(bouquetWeights(1, 1, 2)).toEqual({ columns: 1, rows: 1 })
    const mid = bouquetWeights(0, 1, 1), far = bouquetWeights(0, 0, 2)
    expect(mid.columns * mid.rows).toBe(9)
    expect(far.columns * far.rows).toBe(81)
    // One texture repetition per original-width tuft, even as surfaces expand.
    for (let i = 0; i <= 10; i++) {
      const { columns } = bouquetWeights(i / 10, 1, 1)
      expect(1.08 * columns / columns).toBeCloseTo(1.08)
    }
  })
})
