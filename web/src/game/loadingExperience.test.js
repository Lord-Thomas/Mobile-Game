import { describe, expect, it } from 'vitest'
import {
  advanceLoadingExperience,
  clampLoadingPercent,
  createLoadingExperience,
} from './loadingExperience'

describe('loading experience', () => {
  it('borne le pourcentage entre 0 et 100', () => {
    expect(clampLoadingPercent(-12)).toBe(0)
    expect(clampLoadingPercent(57.6)).toBe(58)
    expect(clampLoadingPercent(140)).toBe(100)
  })

  it('empêche une même progression de reculer', () => {
    const current = createLoadingExperience({ percent: 72, phase: 'Meubles' })
    expect(advanceLoadingExperience(current, { percent: 60, phase: 'Textures' }))
      .toEqual({ kind: 'initial', percent: 72, phase: 'Textures' })
  })

  it('autorise une nouvelle transition à repartir de zéro', () => {
    const initial = createLoadingExperience({ percent: 100 })
    expect(advanceLoadingExperience(initial, {
      kind: 'transition',
      percent: 15,
      phase: 'Ouverture de la porte...',
    })).toEqual({
      kind: 'transition',
      percent: 15,
      phase: 'Ouverture de la porte...',
    })
  })
})
