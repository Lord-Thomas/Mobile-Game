import { useEffect, useState } from 'react'
import {
  BUILTIN_PARTICLE_PRESETS,
  DEFAULT_EMITTER,
  DEFAULT_GROUND_RING,
  DEFAULT_GROUND_ZONE,
  DEFAULT_PARTICLE_PRESET,
  DEFAULT_SHELL,
  EMITTER_BLENDINGS,
  EMITTER_SHAPES,
  EMITTER_TEXTURES,
  MAX_EMITTERS,
  MAX_GROUND_RINGS,
  MAX_GROUND_ZONES,
  MAX_SHELLS,
  normalizeParticlePreset,
} from '../effects/particlePresets'
import { PARTICLE_LIBRARY_UPDATED_EVENT } from '../effects/storedParticlePresets'

const DRAFT_STORAGE_KEY = 'lab_particle_editor_draft_v1'
const LIBRARY_STORAGE_KEY = 'lab_particle_library_v1'
const API_KEY_STORAGE_KEY = 'lab_particle_ai_key_v1'

function loadDraft() {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY)
    return raw ? normalizeParticlePreset(JSON.parse(raw)) : normalizeParticlePreset(BUILTIN_PARTICLE_PRESETS[0])
  } catch {
    return normalizeParticlePreset(DEFAULT_PARTICLE_PRESET)
  }
}

function loadLibrary() {
  try {
    const raw = window.localStorage.getItem(LIBRARY_STORAGE_KEY)
    const stored = raw ? JSON.parse(raw) : []
    return Array.isArray(stored) ? stored.map((entry) => ({
      ...entry,
      preset: normalizeParticlePreset(entry.preset),
    })) : []
  } catch {
    return []
  }
}

function loadApiKey() {
  try {
    return window.localStorage.getItem(API_KEY_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

let state = {
  preset: typeof window === 'undefined' ? DEFAULT_PARTICLE_PRESET : loadDraft(),
  library: typeof window === 'undefined' ? [] : loadLibrary(),
  playing: true,
  loopPreview: true,
  playbackId: 1,
  manualTime: null,
  timelineTime: 0,
  target: 'mob',
  apiKey: typeof window === 'undefined' ? '' : loadApiKey(),
  aiBusy: false,
  aiError: '',
}

const listeners = new Set()

export function getParticleEditorState() {
  return state
}

export function setParticleEditorState(patch) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener(state))
}

function persistDraft(preset) {
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(preset))
  } catch {
    // Local dev tool only: failing to persist should not break the editor.
  }
}

function persistLibrary(library) {
  try {
    window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(library))
    window.dispatchEvent(new Event(PARTICLE_LIBRARY_UPDATED_EVENT))
  } catch {
    // Local dev tool only: failing to persist should not break the editor.
  }
}

export function setParticlePreset(patch) {
  const preset = normalizeParticlePreset({ ...state.preset, ...patch })
  setParticleEditorState({ preset })
  persistDraft(preset)
}

export function replaceParticlePreset(rawPreset) {
  const preset = normalizeParticlePreset(rawPreset)
  setParticleEditorState({
    preset,
    playbackId: state.playbackId + 1,
    playing: true,
    manualTime: null,
    timelineTime: 0,
  })
  persistDraft(preset)
}

export function setParticleEmitter(index, patch) {
  const emitters = state.preset.emitters.map((emitter, i) => (
    i === index ? { ...emitter, ...patch } : emitter
  ))
  setParticlePreset({ emitters })
}

export function addParticleEmitter() {
  if (state.preset.emitters.length >= MAX_EMITTERS) return
  setParticlePreset({ emitters: [...state.preset.emitters, { ...DEFAULT_EMITTER }] })
}

export function removeParticleEmitter(index) {
  if (
    state.preset.emitters.length <= 1
    && state.preset.shells.length === 0
    && state.preset.groundRings.length === 0
    && state.preset.groundZones.length === 0
  ) return
  setParticlePreset({ emitters: state.preset.emitters.filter((_, i) => i !== index) })
}

export function setParticleShell(index, patch) {
  const shells = state.preset.shells.map((shell, i) => (
    i === index ? { ...shell, ...patch } : shell
  ))
  setParticlePreset({ shells })
}

export function addParticleShell() {
  if (state.preset.shells.length >= MAX_SHELLS) return
  setParticlePreset({ shells: [...state.preset.shells, { ...DEFAULT_SHELL }] })
}

export function removeParticleShell(index) {
  setParticlePreset({ shells: state.preset.shells.filter((_, i) => i !== index) })
}

export function setParticleGroundRing(index, patch) {
  const groundRings = state.preset.groundRings.map((ring, i) => (
    i === index ? { ...ring, ...patch } : ring
  ))
  setParticlePreset({ groundRings })
}

export function addParticleGroundRing() {
  if (state.preset.groundRings.length >= MAX_GROUND_RINGS) return
  setParticlePreset({
    groundRings: [
      ...state.preset.groundRings,
      {
        ...DEFAULT_GROUND_RING,
        name: `Anneau incandescent ${state.preset.groundRings.length + 1}`,
      },
    ],
  })
  playParticleEffect()
}

export function duplicateParticleGroundRing(index) {
  if (state.preset.groundRings.length >= MAX_GROUND_RINGS) return
  const source = state.preset.groundRings[index]
  if (!source) return
  const groundRings = [...state.preset.groundRings]
  groundRings.splice(index + 1, 0, { ...source, name: `${source.name} (copie)` })
  setParticlePreset({ groundRings })
}

export function removeParticleGroundRing(index) {
  setParticlePreset({
    groundRings: state.preset.groundRings.filter((_, i) => i !== index),
  })
}

export function setParticleGroundZone(index, patch) {
  const groundZones = state.preset.groundZones.map((zone, i) => (
    i === index ? { ...zone, ...patch } : zone
  ))
  setParticlePreset({ groundZones })
}

export function addParticleGroundZone() {
  if (state.preset.groundZones.length >= MAX_GROUND_ZONES) return
  setParticlePreset({
    groundZones: [
      ...state.preset.groundZones,
      {
        ...DEFAULT_GROUND_ZONE,
        name: `Zone au sol ${state.preset.groundZones.length + 1}`,
      },
    ],
  })
  playParticleEffect()
}

export function duplicateParticleGroundZone(index) {
  if (state.preset.groundZones.length >= MAX_GROUND_ZONES) return
  const source = state.preset.groundZones[index]
  if (!source) return
  const groundZones = [...state.preset.groundZones]
  groundZones.splice(index + 1, 0, { ...source, name: `${source.name} (copie)` })
  setParticlePreset({ groundZones })
}

export function removeParticleGroundZone(index) {
  setParticlePreset({
    groundZones: state.preset.groundZones.filter((_, i) => i !== index),
  })
}

export function playParticleEffect() {
  setParticleEditorState({
    playing: true,
    playbackId: state.playbackId + 1,
    manualTime: null,
    timelineTime: 0,
  })
}

export function stopParticleEffect() {
  setParticleEditorState({ playing: false })
}

export function scrubParticleEffect(time) {
  const timelineTime = Math.max(0, Math.min(state.preset.duration, Number(time) || 0))
  setParticleEditorState({
    playing: true,
    manualTime: timelineTime,
    timelineTime,
  })
}

export function reportParticleTimelineTime(timelineTime) {
  if (state.manualTime !== null) return
  setParticleEditorState({ timelineTime })
}

export function setParticleApiKey(apiKey) {
  setParticleEditorState({ apiKey })
  try {
    window.localStorage.setItem(API_KEY_STORAGE_KEY, apiKey)
  } catch {
    // Local dev tool only.
  }
}

function pick(rng, values) {
  return values[Math.floor(rng() * values.length)]
}

function randomHex(rng) {
  const hue = Math.floor(rng() * 360)
  const saturation = 60 + rng() * 40
  const lightness = 45 + rng() * 35
  const a = (saturation / 100) * Math.min(lightness / 100, 1 - lightness / 100)
  const channel = (n) => {
    const k = (n + hue / 30) % 12
    const value = lightness / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(value * 255).toString(16).padStart(2, '0')
  }
  return `#${channel(0)}${channel(8)}${channel(4)}`
}

export function randomizeParticlePreset() {
  const rng = Math.random
  const emitters = state.preset.emitters.map((emitter) => ({
    ...emitter,
    shape: pick(rng, EMITTER_SHAPES.map((entry) => entry.value)),
    texture: pick(rng, EMITTER_TEXTURES.map((entry) => entry.value)),
    blending: pick(rng, EMITTER_BLENDINGS.map((entry) => entry.value)),
    colorStart: randomHex(rng),
    colorEnd: randomHex(rng),
    sizeStart: 0.05 + rng() * 0.5,
    sizeEnd: rng() * 0.4,
    speed: 0.5 + rng() * 5,
    spread: rng(),
    gravity: (rng() * 2 - 1) * 6,
    turbulence: rng() * 1.2,
    rotationSpeed: (rng() * 2 - 1) * 6,
    lifetime: 0.3 + rng() * 1.5,
  }))
  setParticlePreset({ emitters })
  playParticleEffect()
}

export function duplicateParticlePreset() {
  const preset = {
    ...state.preset,
    id: `${state.preset.id}_copy`,
    name: `${state.preset.name} (copie)`,
  }
  replaceParticlePreset(preset)
}

export function saveParticleToLibrary() {
  const preset = normalizeParticlePreset(state.preset)
  const existingIndex = state.library.findIndex((entry) => (
    entry.preset?.id === preset.id
    || entry.id === preset.id
  ))
  const entry = {
    id: existingIndex >= 0 ? state.library[existingIndex].id : `fx-${Date.now()}`,
    name: preset.name,
    category: preset.category,
    preset,
  }
  const updated = existingIndex >= 0
  const library = updated
    ? state.library.reduce((items, item, index) => {
      if (index === existingIndex) return [...items, entry]
      if (item.preset?.id === preset.id || item.id === preset.id) return items
      return [...items, item]
    }, [])
    : [...state.library, entry]
  setParticleEditorState({ library })
  persistLibrary(library)
  return { entry, updated }
}

export function loadParticleFromLibrary(id) {
  const builtin = BUILTIN_PARTICLE_PRESETS.find((preset) => preset.id === id)
  if (builtin) {
    replaceParticlePreset(builtin)
    return builtin
  }
  const entry = state.library.find((item) => item.id === id)
  if (!entry) return null
  replaceParticlePreset(entry.preset)
  return entry
}

export function deleteParticleFromLibrary(id) {
  const library = state.library.filter((entry) => entry.id !== id)
  setParticleEditorState({ library })
  persistLibrary(library)
}

export function useParticleEditorStore() {
  const [snapshot, setSnapshot] = useState(getParticleEditorState)

  useEffect(() => {
    listeners.add(setSnapshot)
    return () => listeners.delete(setSnapshot)
  }, [])

  return snapshot
}
