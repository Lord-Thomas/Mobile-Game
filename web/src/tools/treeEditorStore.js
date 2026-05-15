import { useEffect, useState } from 'react'
import { DEFAULT_TREE_CONFIG, normalizeTreeConfig } from '../world/trees/proceduralTreeConfig'
import { GAME_TREE_LIBRARY } from '../world/trees/treeLibrary'

const STORAGE_KEY = 'lab_tree_editor_draft_v1'
const LIBRARY_STORAGE_KEY = 'lab_tree_library_v1'

function loadStoredConfig() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? normalizeTreeConfig(JSON.parse(raw)) : DEFAULT_TREE_CONFIG
  } catch {
    return DEFAULT_TREE_CONFIG
  }
}

function loadStoredLibrary() {
  try {
    const raw = window.localStorage.getItem(LIBRARY_STORAGE_KEY)
    return raw ? JSON.parse(raw) : Object.values(GAME_TREE_LIBRARY)
  } catch {
    return Object.values(GAME_TREE_LIBRARY)
  }
}

let state = {
  config: typeof window === 'undefined' ? DEFAULT_TREE_CONFIG : loadStoredConfig(),
  library: typeof window === 'undefined' ? [] : loadStoredLibrary(),
  panelOpen: true,
}
const listeners = new Set()

export function getTreeEditorState() {
  return state
}

export function setTreeEditorState(patch) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener(state))
}

export function setTreeEditorConfig(patch) {
  const nextConfig = normalizeTreeConfig({
    ...state.config,
    ...patch,
    position: {
      ...state.config.position,
      ...(patch.position ?? {}),
    },
    bark: {
      ...state.config.bark,
      ...(patch.bark ?? {}),
    },
    branch: {
      ...state.config.branch,
      ...(patch.branch ?? {}),
    },
    leaves: {
      ...state.config.leaves,
      ...(patch.leaves ?? {}),
    },
  })
  setTreeEditorState({ config: nextConfig })
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextConfig))
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

function makeLibraryConfig(config) {
  const normalized = normalizeTreeConfig(config)
  return {
    ...normalized,
    position: { x: 0, y: normalized.position.y, z: 0 },
    rotationY: 0,
  }
}

export function addCurrentTreeToLibrary() {
  const item = {
    id: `tree-${Date.now()}`,
    name: `${state.config.preset} ${state.config.seed}`,
    config: makeLibraryConfig(state.config),
  }
  const library = [...state.library, item]
  setTreeEditorState({ library })
  persistLibrary(library)
  return item
}

export function loadTreeFromLibrary(id) {
  const item = state.library.find((entry) => entry.id === id)
  if (!item) return null
  setTreeEditorConfig(item.config)
  return item
}

export function deleteTreeFromLibrary(id) {
  const library = state.library.filter((entry) => entry.id !== id)
  setTreeEditorState({ library })
  persistLibrary(library)
}

export function useTreeEditorStore() {
  const [snapshot, setSnapshot] = useState(getTreeEditorState)

  useEffect(() => {
    listeners.add(setSnapshot)
    return () => listeners.delete(setSnapshot)
  }, [])

  return snapshot
}
