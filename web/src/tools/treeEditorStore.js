import { useEffect, useState } from 'react'
import { DEFAULT_TREE_CONFIG, normalizeTreeConfig } from '../world/trees/proceduralTreeConfig'

const STORAGE_KEY = 'lab_tree_editor_draft_v1'

function loadStoredConfig() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? normalizeTreeConfig(JSON.parse(raw)) : DEFAULT_TREE_CONFIG
  } catch {
    return DEFAULT_TREE_CONFIG
  }
}

let state = {
  config: typeof window === 'undefined' ? DEFAULT_TREE_CONFIG : loadStoredConfig(),
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

export function useTreeEditorStore() {
  const [snapshot, setSnapshot] = useState(getTreeEditorState)

  useEffect(() => {
    listeners.add(setSnapshot)
    return () => listeners.delete(setSnapshot)
  }, [])

  return snapshot
}
