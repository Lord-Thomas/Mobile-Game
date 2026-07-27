import { describe, expect, it } from 'vitest'
import {
  getBiomeAreaBaseInfluence,
  getNaturalGraveyardInfluence,
  getNaturalGraveyardNoise,
  getNaturalSurfaceDirtWeight,
} from './terrainSurfaceMaskMath'

describe('terrain surface mask math', () => {
  it('keeps every packed mask channel normalized', () => {
    const roadPoints = [{ x: -4, z: 2 }, { x: 4, z: 2 }]
    const area = {
      center: [0, 0],
      radius: 8,
      feather: 2,
      groundIntensity: 0.8,
    }
    const baseInfluence = getBiomeAreaBaseInfluence(1, 1, area)
    const graveyard = getNaturalGraveyardInfluence(1, 1, baseInfluence)
    const noise = getNaturalGraveyardNoise(1, 1)
    const channels = [
      getNaturalSurfaceDirtWeight(1, 1, roadPoints),
      graveyard,
      noise.coarse,
      noise.fine,
    ]

    for (const channel of channels) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(1)
    }
  })
})
