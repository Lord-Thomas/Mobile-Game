import { describe, expect, it } from 'vitest'
import {
  BOSS_SLIME_RED_VALUES,
  DEFAULT_ART_DIRECTION_VALUES,
} from './artDirectionStore'
import {
  createBossSlimeRuntimeTarget,
  interpolateArtDirectionValues,
} from './artDirectionTransition'

describe('art direction transitions', () => {
  it('interpole les valeurs numériques et les couleurs', () => {
    const middle = interpolateArtDirectionValues(
      DEFAULT_ART_DIRECTION_VALUES,
      BOSS_SLIME_RED_VALUES,
      0.5,
    )

    expect(middle.grading.exposure).toBeCloseTo(1.01)
    expect(middle.fog.backgroundColor).not.toBe(DEFAULT_ART_DIRECTION_VALUES.fog.backgroundColor)
    expect(middle.fog.backgroundColor).not.toBe(BOSS_SLIME_RED_VALUES.fog.backgroundColor)
  })

  it('conserve les ombres et la direction du soleil pour éviter une réallocation GPU', () => {
    const base = {
      ...DEFAULT_ART_DIRECTION_VALUES,
      lighting: {
        ...DEFAULT_ART_DIRECTION_VALUES.lighting,
        sunAzimuth: 72,
        sunElevation: 43,
      },
      shadows: { ...DEFAULT_ART_DIRECTION_VALUES.shadows, mapSize: 2048 },
    }
    const target = createBossSlimeRuntimeTarget(base, BOSS_SLIME_RED_VALUES)

    expect(target.shadows.mapSize).toBe(2048)
    expect(target.lighting.sunAzimuth).toBe(72)
    expect(target.lighting.sunElevation).toBe(43)
    expect(target.lighting.sunColor).toBe(BOSS_SLIME_RED_VALUES.lighting.sunColor)
    expect(target.sky.zenith).toBe(BOSS_SLIME_RED_VALUES.sky.zenith)
  })
})
