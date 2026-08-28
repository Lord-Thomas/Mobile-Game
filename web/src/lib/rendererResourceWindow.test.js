import { describe, expect, it } from 'vitest'
import {
  cloneRendererResourceWindow,
  createRendererResourceWindow,
  readRendererResourceCounts,
  recordRendererResourceCounts,
} from './rendererResourceWindow'

describe('rendererResourceWindow', () => {
  it('tracks start, peak, end and delta without exposing mutable internals', () => {
    const window = createRendererResourceWindow({ textures: 10, geometries: 20, programs: 3 })
    recordRendererResourceCounts(window, { textures: 14, geometries: 18, programs: 5 })
    recordRendererResourceCounts(window, { textures: 12, geometries: 22, programs: 4 })

    const snapshot = cloneRendererResourceWindow(window)
    expect(snapshot).toEqual({
      start: { textures: 10, geometries: 20, programs: 3 },
      end: { textures: 12, geometries: 22, programs: 4 },
      peak: { textures: 14, geometries: 22, programs: 5 },
      delta: { textures: 2, geometries: 2, programs: 1 },
      samples: 3,
    })
    snapshot.end.textures = 999
    expect(window.end.textures).toBe(12)
  })

  it('reads resource counters from a Three.js renderer', () => {
    expect(readRendererResourceCounts({
      info: { memory: { textures: 7, geometries: 9 }, programs: [{}, {}] },
    })).toEqual({ textures: 7, geometries: 9, programs: 2 })
  })
})
