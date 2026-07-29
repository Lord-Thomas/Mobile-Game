import { useEffect, useState } from 'react'
import { BUILTIN_PARTICLE_PRESETS, normalizeParticlePreset } from './particlePresets'

const PARTICLE_LIBRARY_STORAGE_KEY = 'lab_particle_library_v1'
export const PARTICLE_LIBRARY_UPDATED_EVENT = 'lab-particle-library-updated'
export const NECRO_WEAPON_PARTICLE_NAME = 'Nécro 01'
export const SUMMON_START_PARTICLE_NAME = 'Explosion étoiles'
export const SUMMON_END_PARTICLE_NAME = 'End-fumé'

function normalizeParticleLookupKey(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase()
}

export function findStoredParticlePresetByName(name) {
  const targetKey = normalizeParticleLookupKey(name)
  const builtin = BUILTIN_PARTICLE_PRESETS.find((item) => (
    normalizeParticleLookupKey(item?.name) === targetKey
    || normalizeParticleLookupKey(item?.id) === targetKey
  ))
  const fallback = builtin ? normalizeParticlePreset(builtin) : null
  if (typeof window === 'undefined') return fallback

  try {
    const stored = JSON.parse(window.localStorage.getItem(PARTICLE_LIBRARY_STORAGE_KEY) ?? '[]')
    if (!Array.isArray(stored)) return fallback

    const entry = stored.find((item) => (
      normalizeParticleLookupKey(item?.name) === targetKey
      || normalizeParticleLookupKey(item?.id) === targetKey
      || normalizeParticleLookupKey(item?.preset?.name) === targetKey
      || normalizeParticleLookupKey(item?.preset?.id) === targetKey
    ))
    return entry?.preset ? normalizeParticlePreset(entry.preset) : fallback
  } catch {
    return fallback
  }
}

export function useStoredParticlePreset(name) {
  const [preset, setPreset] = useState(() => findStoredParticlePresetByName(name))

  useEffect(() => {
    const refresh = () => setPreset(findStoredParticlePresetByName(name))
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener(PARTICLE_LIBRARY_UPDATED_EVENT, refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
      window.removeEventListener(PARTICLE_LIBRARY_UPDATED_EVENT, refresh)
    }
  }, [name])

  return preset
}
