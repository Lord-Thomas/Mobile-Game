import { describe, expect, it } from 'vitest'
import { getWorldStreamStepDelay } from './worldStream'

describe('worldStream', () => {
  it('atteint le niveau critique sans délai artificiel puis rétablit le souffle GPU', () => {
    expect(getWorldStreamStepDelay(0, 6)).toBe(0)
    expect(getWorldStreamStepDelay(5, 6)).toBe(0)
    expect(getWorldStreamStepDelay(6, 6)).toBe(90)
  })
})
