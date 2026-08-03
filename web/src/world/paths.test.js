import { describe, expect, it } from 'vitest'
import { DEFAULT_PATH_HARDNESS, normalizePathStamp } from './paths'

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
})
