import { useEffect, useState } from 'react'
import {
  BUILTIN_PARTICLE_PRESETS,
  DEFAULT_EMITTER,
  DEFAULT_PARTICLE_PRESET,
  DEFAULT_SHELL,
  EMITTER_BLENDINGS,
  EMITTER_SHAPES,
  EMITTER_TEXTURES,
  MAX_EMITTERS,
  MAX_SHELLS,
  normalizeParticlePreset,
} from '../effects/particlePresets'

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
  setParticleEditorState({ preset, playbackId: state.playbackId + 1, playing: true })
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
  if (state.preset.emitters.length <= 1) return
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

export function playParticleEffect() {
  setParticleEditorState({ playing: true, playbackId: state.playbackId + 1 })
}

export function stopParticleEffect() {
  setParticleEditorState({ playing: false })
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
  const entry = {
    id: `fx-${Date.now()}`,
    name: state.preset.name,
    category: state.preset.category,
    preset: normalizeParticlePreset(state.preset),
  }
  const library = [...state.library, entry]
  setParticleEditorState({ library })
  persistLibrary(library)
  return entry
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
