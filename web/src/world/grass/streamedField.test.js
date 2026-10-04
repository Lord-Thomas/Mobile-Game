import { expect, it } from 'vitest'
import { createStreamedField, EARTH_AREA_SIDE, STREAM_SLOT_COUNT } from './streamedField'
import { densityDrawCount } from './densityLod'

function complete(field) {
  while (field.stats().pending) field.step(Infinity, STREAM_SLOT_COUNT)
}

it('has the same buffer budget on a 1 km map and an Earth-area map', () => {
  const small = createStreamedField(0.5, 1000)
  const earth = createStreamedField(0.5, EARTH_AREA_SIDE)
  expect(earth.byteLength).toBe(small.byteLength)
  earth.target(0, 0); complete(earth)
  expect(earth.stats().loaded).toBe(STREAM_SLOT_COUNT)
  const arrays = earth.slots.map(slot => slot.data)
  const ranks = earth.slots.map(slot => slot.ranks)
  const origin = earth.slots.find(slot => slot.key === '0:0')
  const initial = origin.data.slice()
  const originSlot = origin.id
  // One-cell move keeps overlapping geometry intact and queues only one strip.
  earth.target(8, 0)
  expect(earth.stats().pending).toBe(31)
  expect(earth.slots.find(slot => slot.key === '0:0').id).toBe(originSlot)
  complete(earth)
  // Large positive/negative coordinates remain only in CPU double precision.
  for (const [x, z] of [[5_000_000, -4_000_000], [-9_000_000, 9_000_000], [0, 0]]) {
    earth.target(x, z); complete(earth)
    expect(earth.stats().loaded).toBe(STREAM_SLOT_COUNT)
    for (let i = 0; i < earth.slots.length; i++) {
      expect(earth.slots[i].data).toBe(arrays[i])
      expect(earth.slots[i].ranks).toBe(ranks[i])
      expect(earth.slots[i].data[0]).toBeGreaterThan(-0.5)
      expect(earth.slots[i].data[0]).toBeLessThan(8.5)
    }
  }
  expect(earth.slots.find(slot => slot.key === '0:0').data).toEqual(initial)
  expect(earth.slots.find(slot => slot.key === '1:0').data).not.toEqual(initial)
}, 20000)

it('retires only cells outside the visible LOD range during ordinary movement', () => {
  const field = createStreamedField(0.5, 1000)
  field.target(0, 0); complete(field)
  const previous = field.slots.map(slot => ({ key: slot.key, cx: slot.cx, cz: slot.cz, bounds: slot.bounds, count: slot.count }))
  field.target(8, 8)
  const surviving = new Set(field.slots.map(slot => slot.key))
  for (const old of previous) {
    if (!surviving.has(old.key)) expect(densityDrawCount(old.count, old.bounds, 8 - old.cx * 8, 8 - old.cz * 8)).toBe(0)
  }
  expect(field.stats().pending).toBe(61)
  field.step(Infinity, 2)
  expect(field.stats().pending).toBe(59)
})

it('clips finite map edges and does not allocate extra cells outside the map', () => {
  const field = createStreamedField(0.5, 20)
  field.target(9, 9); complete(field)
  expect(field.stats().loaded).toBeLessThan(STREAM_SLOT_COUNT)
  for (const slot of field.slots) for (let i = 0; i < slot.count; i++) {
    expect(Math.abs(slot.data[i * 4] + slot.cx * 8)).toBeLessThanOrEqual(9.851)
    expect(Math.abs(slot.data[i * 4 + 2] + slot.cz * 8)).toBeLessThanOrEqual(9.851)
  }
})
