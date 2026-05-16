import { useEffect, useState } from 'react'
import { DEFAULT_HOUSE_CONFIG, GAME_HOUSE_LIBRARY, normalizeHouseConfig } from '../world/house/housePresets'

const STORAGE_KEY = 'lab_house_editor_draft_v1'
const LIBRARY_STORAGE_KEY = 'lab_house_library_v1'

function loadStoredConfig() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? normalizeHouseConfig(JSON.parse(raw)) : DEFAULT_HOUSE_CONFIG
  } catch {
    return DEFAULT_HOUSE_CONFIG
  }
}

function loadStoredLibrary() {
  try {
    const raw = window.localStorage.getItem(LIBRARY_STORAGE_KEY)
    return raw ? JSON.parse(raw) : Object.values(GAME_HOUSE_LIBRARY)
  } catch {
    return Object.values(GAME_HOUSE_LIBRARY)
  }
}

let state = {
  config: typeof window === 'undefined' ? DEFAULT_HOUSE_CONFIG : loadStoredConfig(),
  library: typeof window === 'undefined' ? [] : loadStoredLibrary(),
}
const listeners = new Set()

function emit(nextState) {
  state = nextState
  listeners.forEach((listener) => listener(state))
}

function persistConfig(config) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Local dev tool only.
  }
}

function persistLibrary(library) {
  try {
    window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(library))
  } catch {
    // Local dev tool only.
  }
}

export function setHouseEditorConfig(patch) {
  const nextConfig = normalizeHouseConfig({
    ...state.config,
    ...patch,
  })
  emit({ ...state, config: nextConfig })
  persistConfig(nextConfig)
}

export function updateHousePart(partId, patch) {
  setHouseEditorConfig({
    parts: state.config.parts.map((part) => (
      part.id === partId
        ? {
            ...part,
            ...patch,
            offset: patch.offset ?? part.offset,
            size: patch.size ?? part.size,
          }
        : part
    )),
  })
}

export function addHousePart() {
  const annexIndex = state.config.parts.length
  setHouseEditorConfig({
    parts: [
      ...state.config.parts,
      {
        id: `annex_${annexIndex}`,
        offset: [4 + annexIndex * 0.4, 0],
        size: [2.8, 2.8, 3.4],
        roofType: 'lean_to',
      },
    ],
  })
}

export function deleteHousePart(partId) {
  if (partId === 'main') return
  setHouseEditorConfig({
    parts: state.config.parts.filter((part) => part.id !== partId),
  })
}

export function addCurrentHouseToLibrary() {
  const item = {
    id: `house-${Date.now()}`,
    name: state.config.name || `Maison ${state.library.length + 1}`,
    config: normalizeHouseConfig(state.config),
  }
  const library = [...state.library, item]
  emit({ ...state, library })
  persistLibrary(library)
  return item
}

export function loadHouseFromLibrary(id) {
  const item = state.library.find((entry) => entry.id === id)
  if (!item) return null
  setHouseEditorConfig(item.config)
  return item
}

export function deleteHouseFromLibrary(id) {
  const library = state.library.filter((entry) => entry.id !== id)
  emit({ ...state, library })
  persistLibrary(library)
}

export function useHouseEditorStore() {
  const [snapshot, setSnapshot] = useState(state)

  useEffect(() => {
    listeners.add(setSnapshot)
    return () => listeners.delete(setSnapshot)
  }, [])

  return snapshot
}
