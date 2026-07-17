import { useEffect, useState } from 'react'
import { normalizeParticlePreset } from './particlePresets'

const PARTICLE_LIBRARY_STORAGE_KEY = 'lab_particle_library_v1'
export const NECRO_WEAPON_PARTICLE_NAME = 'Nécro 01'
export const SUMMON_START_PARTICLE_NAME = 'Explosion étoiles'
export const SUMMON_END_PARTICLE_NAME = 'End-fumé'

function normalizeParticleLookupKey(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase()
}

export function findStoredParticlePresetByName(name) {
  if (typeof window === 'undefined') return null

  try {
    const targetKey = normalizeParticleLookupKey(name)
    const stored = JSON.parse(window.localStorage.getItem(PARTICLE_LIBRARY_STORAGE_KEY) ?? '[]')
    if (!Array.isArray(stored)) return null

    const entry = stored.find((item) => (
      normalizeParticleLookupKey(item?.name) === targetKey
      || normalizeParticleLookupKey(item?.id) === targetKey
      || normalizeParticleLookupKey(item?.preset?.name) === targetKey
      || normalizeParticleLookupKey(item?.preset?.id) === targetKey
    ))
    return entry?.preset ? normalizeParticlePreset(entry.preset) : null
  } catch {
    return null
  }
}

export function useStoredParticlePreset(name) {
  const [preset, setPreset] = useState(() => findStoredParticlePresetByName(name))

  useEffect(() => {
    const refresh = () => setPreset(findStoredParticlePresetByName(name))
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [name])

  return preset
}
