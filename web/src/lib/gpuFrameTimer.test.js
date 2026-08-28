import { describe, expect, it } from 'vitest'
import { WebGlGpuFrameTimer, summarizeGpuSamples } from './gpuFrameTimer'

function createFakeContext() {
  const results = new Map()
  let nextQueryId = 1
  let activeQuery = null
  return {
    QUERY_RESULT_AVAILABLE: 1,
    QUERY_RESULT: 2,
    getExtension: () => ({ TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 }),
    createQuery: () => ({ id: nextQueryId++ }),
    beginQuery: (_, query) => { activeQuery = query },
    endQuery: () => {
      results.set(activeQuery, 2_500_000)
      activeQuery = null
    },
    getParameter: () => false,
    getQueryParameter: (query, key) => key === 1 ? results.has(query) : results.get(query),
    deleteQuery: (query) => results.delete(query),
  }
}

describe('WebGlGpuFrameTimer', () => {
  it('collects asynchronous GPU durations without blocking the frame', () => {
    const timer = new WebGlGpuFrameTimer(createFakeContext())

    expect(timer.beginFrame()).toBe(true)
    timer.endFrame()
    expect(timer.snapshot()).toMatchObject({
      supported: true,
      averageMs: 2.5,
      p95Ms: 2.5,
      samples: 1,
    })
  })

  it('reports unsupported contexts explicitly', () => {
    const timer = new WebGlGpuFrameTimer({ getExtension: () => null })
    expect(timer.snapshot()).toMatchObject({ supported: false, samples: 0 })
  })

  it('does not mix samples recorded before and after a reset', () => {
    const timer = new WebGlGpuFrameTimer(createFakeContext())
    timer.beginFrame()
    timer.endFrame()
    timer.reset()

    expect(timer.snapshot()).toMatchObject({ averageMs: null, samples: 0 })

    timer.beginFrame()
    timer.endFrame()
    expect(timer.snapshot()).toMatchObject({ averageMs: 2.5, samples: 1 })
  })
})

describe('summarizeGpuSamples', () => {
  it('computes stable percentiles', () => {
    expect(summarizeGpuSamples([1, 2, 3, 10])).toMatchObject({
      averageMs: 4,
      medianMs: 2,
      p95Ms: 10,
      p99Ms: 10,
      maxMs: 10,
    })
  })
})
