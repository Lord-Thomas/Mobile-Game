import { expect, it } from 'vitest'
import { Box3, Vector3 } from 'three'
import { prepareDensityBatch, densityDrawCount } from './densityLod'
it('preserves all tuft records, uses deterministic nested subsets and keeps source untouched', () => {
  const data = Float32Array.from({length: 4000}, (_, i) => i)
  const source = data.slice()
  const batch = { data, count: 1000 }
  const a = prepareDensityBatch(batch), b = prepareDensityBatch(batch)
  expect(a.data).toEqual(b.data)
  expect(data).toEqual(source)
  expect(Array.from({length: 1000}, (_, i) => a.data[i * 4]).sort((x,y) => x-y)).toEqual(Array.from({length:1000}, (_,i) => i*4))
  for (let i=0;i<1000;i++) {
    expect(Array.from(a.data.slice(i*4,i*4+4))).toEqual([a.data[i*4],a.data[i*4]+1,a.data[i*4]+2,a.data[i*4]+3])
    if(i) expect(a.ranks[i]).toBeGreaterThan(a.ranks[i-1])
  }
})
it('keeps full density near the player and never cuts a still-fading instance', () => {
  const box = new Box3(new Vector3(0,-2,0),new Vector3(8,2,8))
  expect(densityDrawCount(1000,box,4,4)).toBe(1000)
  expect(densityDrawCount(1000,box,-40,4)).toBe(1000)
  expect(densityDrawCount(1000,box,-100,4)).toBe(0)
  expect(densityDrawCount(1000,box,-52,4)).toBe(500)
  expect(densityDrawCount(1000,box,-62,4)).toBe(250)
  for(let d=40;d<=100;d+=0.5) {
    const n=densityDrawCount(1000,box,-d,4)
    for(let i=n;i<1000;i++) {
      const end=Math.min(100,42-10*Math.log2((i+0.5)/1000))
      expect(end).toBeLessThanOrEqual(d)
    }
  }
})
