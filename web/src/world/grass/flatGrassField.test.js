import { expect, it } from 'vitest'
import { getFlatGrassField } from '../TerrainGroundCover'

it('builds only a flat 30m test field, at full density, and reuses it', async () => {
  const pending = getFlatGrassField(30)
  expect(getFlatGrassField(30)).toBe(pending)
  const field = await pending
  let total = 0
  for (const batch of field.fields) {
    expect(batch.count * 4).toBeLessThanOrEqual(batch.data.length)
    total += batch.count
    let valid = true
    for (let i = 0; i < batch.count * 4; i += 4) {
      valid &&= Math.abs(batch.data[i]) <= 15 && Math.abs(batch.data[i + 2]) <= 15
        && Math.abs(batch.data[i + 1] - 0.04) < 0.00001
        && batch.data[i + 3] >= 0.179 && batch.data[i + 3] <= 0.301
    }
    expect(valid).toBe(true)
  }
  expect(total).toBeGreaterThan(17500)
  expect(total).toBeLessThan(19000)
  expect((await getFlatGrassField(12)).fields.reduce((sum, batch) => sum + batch.count, 0)).toBeLessThan(total / 4)
})

it('scales tuft count with density and terrain area, with bounded valid buffers', async () => {
  const count = field => field.fields.reduce((sum, batch) => sum + batch.count, 0)
  const base = count(await getFlatGrassField(20, 1))
  const denseField = await getFlatGrassField(20, 4)
  expect(count(denseField) / base).toBeGreaterThan(3.9)
  expect(count(denseField) / base).toBeLessThan(4.1)
  expect(count(await getFlatGrassField(40, 1)) / base).toBeGreaterThan(3.9)
  const maximum = await getFlatGrassField(200, 6)
  for (const batch of maximum.fields) {
    expect(batch.count * 4).toBeLessThanOrEqual(batch.data.length)
    expect(batch.data.subarray(0, batch.count * 4).every(Number.isFinite)).toBe(true)
  }
  expect(count(maximum)).toBeGreaterThan(4900000)
  expect(() => getFlatGrassField(Infinity, 1)).toThrow(RangeError)
  expect(() => getFlatGrassField(30, 0)).toThrow(RangeError)
})
