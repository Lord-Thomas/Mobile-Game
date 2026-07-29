import { describe, expect, it } from 'vitest'
import {
  BUILTIN_PARTICLE_PRESETS,
  DEFAULT_GROUND_RING,
  DEFAULT_GROUND_ZONE,
  normalizeParticlePreset,
} from './particlePresets'

describe('particlePresets VFX', () => {
  it('conserve la compatibilité avec un ancien preset de particules', () => {
    const preset = normalizeParticlePreset({
      id: 'legacy',
      name: 'Ancien effet',
      emitters: [{ shape: 'circle', radius: 1.4 }],
    })

    expect(preset.emitters).toHaveLength(1)
    expect(preset.emitters[0].radiusEnd).toBe(1.4)
    expect(preset.groundRings).toEqual([])
    expect(preset.groundZones).toEqual([])
  })

  it('autorise un preset composé uniquement d’une zone persistante au sol', () => {
    const preset = normalizeParticlePreset({
      id: 'zone_only',
      name: 'Zone seule',
      emitters: [],
      shells: [],
      groundRings: [],
      groundZones: [{ ...DEFAULT_GROUND_ZONE, duration: 7.2 }],
    })

    expect(preset.emitters).toEqual([])
    expect(preset.groundZones).toHaveLength(1)
    expect(preset.groundZones[0].duration).toBe(7.2)
  })

  it('autorise un preset composé uniquement d’un anneau VFX', () => {
    const preset = normalizeParticlePreset({
      id: 'ring_only',
      name: 'Anneau seul',
      emitters: [],
      shells: [],
      groundRings: [{ ...DEFAULT_GROUND_RING }],
    })

    expect(preset.emitters).toEqual([])
    expect(preset.groundRings).toHaveLength(1)
    expect(preset.groundRings[0].enabled).toBe(true)
  })

  it('normalise les limites des paramètres lumineux et géométriques', () => {
    const preset = normalizeParticlePreset({
      emitters: [],
      groundRings: [{
        intensity: 99,
        opacity: -2,
        startRadius: -1,
        endRadius: 100,
      }],
    })
    const ring = preset.groundRings[0]

    expect(ring.intensity).toBe(8)
    expect(ring.opacity).toBe(0)
    expect(ring.startRadius).toBe(0.02)
    expect(ring.endRadius).toBe(30)
  })

  it('fournit un preset de départ pour l’onde enflammée du Roi Slime', () => {
    const preset = BUILTIN_PARTICLE_PRESETS.find(({ id }) => id === 'slime_shockwave_fire')

    expect(preset).toBeTruthy()
    expect(preset.groundRings).toHaveLength(1)
    expect(preset.emitters.every(({ shape }) => shape === 'ring')).toBe(true)
  })

  it('fournit une zone dangereuse éditable pour les projectiles du Roi Slime', () => {
    const preset = BUILTIN_PARTICLE_PRESETS.find(({ id }) => id === 'slime_projectile_zone')

    expect(preset).toBeTruthy()
    expect(preset.groundZones).toHaveLength(1)
    expect(preset.groundZones[0].startRadius).toBeCloseTo(1.75)
  })
})
