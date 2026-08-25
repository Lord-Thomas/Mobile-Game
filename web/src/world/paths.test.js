import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PATH_HARDNESS,
  DEFAULT_PATH_OPACITY,
  createPaintedSurfaceSampler,
  getPaintCoverageThresholdAt,
  normalizePathStamp,
} from './paths'

describe('normalizePathStamp', () => {
  it('preserves grass paint and its brush hardness', () => {
    const stamp = normalizePathStamp({ type: 'grass', hardness: 0.8 })

    expect(stamp.type).toBe('grass')
    expect(stamp.hardness).toBe(0.8)
  })

  it('uses the default hardness for older saved maps', () => {
    expect(normalizePathStamp({ type: 'dirt' }).hardness).toBe(DEFAULT_PATH_HARDNESS)
  })

  it('clamps brush hardness to its supported range', () => {
    expect(normalizePathStamp({ hardness: -2 }).hardness).toBe(0)
    expect(normalizePathStamp({ hardness: 3 }).hardness).toBe(1)
  })

  it('preserves opacity and keeps older maps fully opaque', () => {
    expect(normalizePathStamp({ opacity: 0.25 }).opacity).toBe(0.25)
    expect(normalizePathStamp({ type: 'dirt' }).opacity).toBe(DEFAULT_PATH_OPACITY)
  })

  it('clamps opacity to its supported range', () => {
    expect(normalizePathStamp({ opacity: -2 }).opacity).toBe(0)
    expect(normalizePathStamp({ opacity: 3 }).opacity).toBe(1)
  })

  it('does not accumulate opacity when identical stamps overlap', () => {
    const threshold = getPaintCoverageThresholdAt(4, 5)
    const opacityBelowThreshold = Math.max(0, threshold - 0.01)
    const stamps = Array.from({ length: 8 }, () => ({
      type: 'grass', center: [4, 5], width: 4, hardness: 1, opacity: opacityBelowThreshold,
    }))
    const sampler = createPaintedSurfaceSampler(stamps)

    expect(sampler.sampleGrassWeights(4, 5)).toEqual({ naturalWeight: 1, grassWeight: 0 })
  })

  it('composes newer non-grass paint over existing grass', () => {
    const threshold = getPaintCoverageThresholdAt(0, 0)
    const sampler = createPaintedSurfaceSampler([
      { type: 'grass', center: [0, 0], width: 4, hardness: 1, opacity: 1 },
      {
        type: 'dirt',
        center: [0, 0],
        width: 4,
        hardness: 1,
        opacity: Math.min(1, threshold + 0.01),
      },
    ])

    const weights = sampler.sampleGrassWeights(0, 0)
    expect(weights.naturalWeight).toBe(0)
    expect(weights.grassWeight).toBe(0)
  })

  it('leaves unpainted positions entirely natural', () => {
    const sampler = createPaintedSurfaceSampler([
      { type: 'grass', center: [20, 20], width: 2, opacity: 1 },
    ])

    expect(sampler.sampleGrassWeights(0, 0)).toEqual({
      naturalWeight: 1,
      grassWeight: 0,
    })
  })
})
