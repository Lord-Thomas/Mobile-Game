import { create } from 'zustand'

export const ART_DIRECTION_STORAGE_KEY = 'lord-thomas-art-direction-v1'
export const ART_DIRECTION_DOCUMENT_VERSION = 1
export const BOSS_SLIME_PRESET_ID = 'boss-slime-red'

export const ART_DIRECTION_BASE_COLORS = Object.freeze({
  terrain: '#4f8d2e',
  grass: '#59bd36',
  leaves: '#58b33a',
  trunks: '#ffffff',
})

export const DEFAULT_ART_DIRECTION_VALUES = Object.freeze({
  lighting: Object.freeze({
    sunAzimuth: 26.6,
    sunElevation: 51.3,
    sunColor: '#fff0b8',
    sunIntensity: 4.2,
    hemisphereIntensity: 1.75,
    skyLightColor: '#d5edff',
    groundLightColor: '#63a75b',
  }),
  shadows: Object.freeze({
    enabled: true,
    mapSize: 512,
    extent: 24,
    bias: -0.00025,
    normalBias: 0.022,
    radius: 1.35,
  }),
  sky: Object.freeze({
    horizon: '#bfe8f9',
    zenith: '#79c6f2',
    cloudBase: '#fffef7',
    cloudWarm: '#fff2ce',
    cloudShade: '#c5d6ec',
    brightness: 1.1,
    cloudCoverage: 0.11,
  }),
  fog: Object.freeze({
    backgroundColor: '#c0e8fa',
    color: '#d7eef5',
    density: 0.0011,
  }),
  surfaces: Object.freeze({
    terrain: Object.freeze({ color: ART_DIRECTION_BASE_COLORS.terrain, roughness: 0.88 }),
    grass: Object.freeze({ color: ART_DIRECTION_BASE_COLORS.grass, roughness: 0.82 }),
    leaves: Object.freeze({ color: ART_DIRECTION_BASE_COLORS.leaves, roughness: 0.72 }),
    trunks: Object.freeze({ color: ART_DIRECTION_BASE_COLORS.trunks, roughness: 0.86 }),
  }),
  grading: Object.freeze({
    exposure: 1.08,
    contrast: 1,
    saturation: 1,
    temperature: 0,
  }),
})

const FACTORY_PRESET_ID = 'factory-daylight'

export const BOSS_SLIME_RED_VALUES = Object.freeze({
  ...DEFAULT_ART_DIRECTION_VALUES,
  lighting: Object.freeze({
    ...DEFAULT_ART_DIRECTION_VALUES.lighting,
    sunAzimuth: -18,
    sunElevation: 34,
    sunColor: '#ff725e',
    sunIntensity: 3.8,
    hemisphereIntensity: 1.15,
    skyLightColor: '#8f4051',
    groundLightColor: '#431c28',
  }),
  sky: Object.freeze({
    ...DEFAULT_ART_DIRECTION_VALUES.sky,
    horizon: '#8c3a49',
    zenith: '#24172f',
    cloudBase: '#d78383',
    cloudWarm: '#ff6759',
    cloudShade: '#51213b',
    brightness: 0.74,
    cloudCoverage: 0.18,
  }),
  fog: Object.freeze({
    backgroundColor: '#421a2b',
    color: '#6d2938',
    density: 0.002,
  }),
  surfaces: Object.freeze({
    terrain: Object.freeze({ color: '#654126', roughness: 0.9 }),
    grass: Object.freeze({ color: '#79502d', roughness: 0.84 }),
    leaves: Object.freeze({ color: '#6f4431', roughness: 0.75 }),
    trunks: Object.freeze({ color: '#c58d82', roughness: 0.88 }),
  }),
  grading: Object.freeze({
    exposure: 0.94,
    contrast: 1.12,
    saturation: 0.92,
    temperature: 0.38,
  }),
})

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

function normalizeColor(value, fallback) {
  const text = String(value ?? '')
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : fallback
}

function normalizeSurface(value, fallback) {
  return {
    color: normalizeColor(value?.color, fallback.color),
    roughness: clampNumber(value?.roughness, 0, 1, fallback.roughness),
  }
}

export function normalizeArtDirectionValues(input = {}) {
  const fallback = DEFAULT_ART_DIRECTION_VALUES
  return {
    lighting: {
      sunAzimuth: clampNumber(input.lighting?.sunAzimuth, -180, 180, fallback.lighting.sunAzimuth),
      sunElevation: clampNumber(input.lighting?.sunElevation, 1, 89, fallback.lighting.sunElevation),
      sunColor: normalizeColor(input.lighting?.sunColor, fallback.lighting.sunColor),
      sunIntensity: clampNumber(input.lighting?.sunIntensity, 0, 12, fallback.lighting.sunIntensity),
      hemisphereIntensity: clampNumber(
        input.lighting?.hemisphereIntensity,
        0,
        6,
        fallback.lighting.hemisphereIntensity,
      ),
      skyLightColor: normalizeColor(input.lighting?.skyLightColor, fallback.lighting.skyLightColor),
      groundLightColor: normalizeColor(input.lighting?.groundLightColor, fallback.lighting.groundLightColor),
    },
    shadows: {
      enabled: typeof input.shadows?.enabled === 'boolean'
        ? input.shadows.enabled
        : fallback.shadows.enabled,
      mapSize: [256, 512, 1024, 2048].includes(Number(input.shadows?.mapSize))
        ? Number(input.shadows.mapSize)
        : fallback.shadows.mapSize,
      extent: clampNumber(input.shadows?.extent, 8, 80, fallback.shadows.extent),
      bias: clampNumber(input.shadows?.bias, -0.01, 0.01, fallback.shadows.bias),
      normalBias: clampNumber(input.shadows?.normalBias, 0, 0.2, fallback.shadows.normalBias),
      radius: clampNumber(input.shadows?.radius, 0, 8, fallback.shadows.radius),
    },
    sky: {
      horizon: normalizeColor(input.sky?.horizon, fallback.sky.horizon),
      zenith: normalizeColor(input.sky?.zenith, fallback.sky.zenith),
      cloudBase: normalizeColor(input.sky?.cloudBase, fallback.sky.cloudBase),
      cloudWarm: normalizeColor(input.sky?.cloudWarm, fallback.sky.cloudWarm),
      cloudShade: normalizeColor(input.sky?.cloudShade, fallback.sky.cloudShade),
      brightness: clampNumber(input.sky?.brightness, 0.2, 3, fallback.sky.brightness),
      cloudCoverage: clampNumber(input.sky?.cloudCoverage, -0.4, 0.45, fallback.sky.cloudCoverage),
    },
    fog: {
      backgroundColor: normalizeColor(input.fog?.backgroundColor, fallback.fog.backgroundColor),
      color: normalizeColor(input.fog?.color, fallback.fog.color),
      density: clampNumber(input.fog?.density, 0, 0.025, fallback.fog.density),
    },
    surfaces: {
      terrain: normalizeSurface(input.surfaces?.terrain, fallback.surfaces.terrain),
      grass: normalizeSurface(input.surfaces?.grass, fallback.surfaces.grass),
      leaves: normalizeSurface(input.surfaces?.leaves, fallback.surfaces.leaves),
      trunks: normalizeSurface(input.surfaces?.trunks, fallback.surfaces.trunks),
    },
    grading: {
      exposure: clampNumber(input.grading?.exposure, 0.2, 3, fallback.grading.exposure),
      contrast: clampNumber(input.grading?.contrast, 0.4, 2, fallback.grading.contrast),
      saturation: clampNumber(input.grading?.saturation, 0, 2.5, fallback.grading.saturation),
      temperature: clampNumber(input.grading?.temperature, -1, 1, fallback.grading.temperature),
    },
  }
}

function createFactoryPreset() {
  const values = normalizeArtDirectionValues(DEFAULT_ART_DIRECTION_VALUES)
  return {
    id: FACTORY_PRESET_ID,
    name: 'Lumière du jour',
    builtin: true,
    values,
    baselineValues: clone(values),
  }
}

function createBossSlimePreset() {
  const values = normalizeArtDirectionValues(BOSS_SLIME_RED_VALUES)
  return {
    id: BOSS_SLIME_PRESET_ID,
    name: 'Boss Slime rouge',
    builtin: true,
    values,
    baselineValues: clone(values),
  }
}

function ensureBuiltinPresets(presets) {
  const next = [...presets]
  if (!next.some((preset) => preset.id === FACTORY_PRESET_ID)) next.unshift(createFactoryPreset())
  if (!next.some((preset) => preset.id === BOSS_SLIME_PRESET_ID)) next.push(createBossSlimePreset())
  return next
}

function normalizePreset(input, index = 0) {
  const values = normalizeArtDirectionValues(input?.values)
  return {
    id: String(input?.id || `art-preset-${Date.now().toString(36)}-${index}`),
    name: String(input?.name || `Preset ${index + 1}`).trim().slice(0, 80) || `Preset ${index + 1}`,
    builtin: (
      input?.id === FACTORY_PRESET_ID ||
      input?.id === BOSS_SLIME_PRESET_ID
    ) && input?.builtin === true,
    values,
    baselineValues: normalizeArtDirectionValues(input?.baselineValues ?? values),
  }
}

export function parseArtDirectionDocument(input) {
  const document = typeof input === 'string' ? JSON.parse(input) : input
  const sourcePresets = Array.isArray(document?.presets)
    ? document.presets
    : document?.values
      ? [document]
      : []
  if (sourcePresets.length === 0) {
    throw new Error('Le fichier ne contient aucun preset de direction artistique.')
  }
  return sourcePresets.map(normalizePreset)
}

function createStateFromDocument(document) {
  const presets = ensureBuiltinPresets(parseArtDirectionDocument(document))
  const activePresetId = presets.some((preset) => preset.id === document?.activePresetId)
    ? document.activePresetId
    : presets[0].id
  return {
    presets,
    activePresetId,
    comparisonPresetId: presets.some((preset) => preset.id === document?.comparisonPresetId)
      ? document.comparisonPresetId
      : presets.find((preset) => preset.id !== activePresetId)?.id ?? activePresetId,
    comparisonView: 'active',
    runtimeValues: null,
  }
}

function loadPersistedState() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ART_DIRECTION_STORAGE_KEY)
    if (!raw) return null
    const document = JSON.parse(raw)
    return createStateFromDocument(document)
  } catch {
    return null
  }
}

function makeUniqueId(prefix = 'art-preset') {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  return `${prefix}-${random}`
}

function replaceAtPath(source, path, value) {
  const keys = String(path).split('.')
  const result = clone(source)
  let cursor = result
  keys.slice(0, -1).forEach((key) => {
    cursor[key] = { ...cursor[key] }
    cursor = cursor[key]
  })
  cursor[keys.at(-1)] = value
  return result
}

const persistedState = loadPersistedState()
const initialPreset = createFactoryPreset()
const initialBossPreset = createBossSlimePreset()

export const useArtDirectionStore = create((set, get) => ({
  presets: persistedState?.presets ?? [initialPreset, initialBossPreset],
  activePresetId: persistedState?.activePresetId ?? initialPreset.id,
  comparisonPresetId: persistedState?.comparisonPresetId ?? initialPreset.id,
  comparisonView: 'active',
  runtimeValues: null,

  setRuntimeValues: (values) => set({
    runtimeValues: values ? normalizeArtDirectionValues(values) : null,
  }),

  selectPreset: (presetId) => set((state) => (
    state.presets.some((preset) => preset.id === presetId)
      ? { activePresetId: presetId, comparisonView: 'active' }
      : {}
  )),

  setValue: (path, value) => set((state) => ({
    presets: state.presets.map((preset) => (
      preset.id === state.activePresetId
        ? {
          ...preset,
          values: normalizeArtDirectionValues(replaceAtPath(preset.values, path, value)),
        }
        : preset
    )),
    comparisonView: 'active',
  })),

  createPreset: (name = 'Nouveau preset') => {
    const current = get().presets.find((preset) => preset.id === get().activePresetId) ?? initialPreset
    const values = clone(current.values)
    const preset = {
      id: makeUniqueId(),
      name: String(name).trim().slice(0, 80) || 'Nouveau preset',
      builtin: false,
      values,
      baselineValues: clone(values),
    }
    set((state) => ({
      presets: [...state.presets, preset],
      activePresetId: preset.id,
      comparisonView: 'active',
    }))
    return preset.id
  },

  duplicatePreset: () => {
    const current = get().presets.find((preset) => preset.id === get().activePresetId)
    if (!current) return null
    const values = clone(current.values)
    const preset = {
      id: makeUniqueId(),
      name: `${current.name} — copie`,
      builtin: false,
      values,
      baselineValues: clone(values),
    }
    set((state) => ({
      presets: [...state.presets, preset],
      activePresetId: preset.id,
      comparisonView: 'active',
    }))
    return preset.id
  },

  renamePreset: (name) => set((state) => ({
    presets: state.presets.map((preset) => (
      preset.id === state.activePresetId
        ? { ...preset, name: String(name).trim().slice(0, 80) || preset.name }
        : preset
    )),
  })),

  restorePreset: () => set((state) => ({
    presets: state.presets.map((preset) => (
      preset.id === state.activePresetId
        ? { ...preset, values: clone(preset.baselineValues) }
        : preset
    )),
    comparisonView: 'active',
  })),

  deletePreset: () => set((state) => {
    if (state.presets.length <= 1) return {}
    const presets = state.presets.filter((preset) => preset.id !== state.activePresetId)
    if (presets.length === state.presets.length) return {}
    const activePresetId = presets[0].id
    return {
      presets,
      activePresetId,
      comparisonPresetId: presets.some((preset) => preset.id === state.comparisonPresetId)
        ? state.comparisonPresetId
        : activePresetId,
      comparisonView: 'active',
    }
  }),

  setComparisonPreset: (presetId) => set((state) => (
    state.presets.some((preset) => preset.id === presetId)
      ? { comparisonPresetId: presetId }
      : {}
  )),

  toggleComparisonView: () => set((state) => ({
    comparisonView: state.comparisonView === 'active' ? 'comparison' : 'active',
  })),

  importDocument: (document) => {
    const imported = parseArtDirectionDocument(document).map((preset) => ({
      ...preset,
      id: makeUniqueId('imported-art-preset'),
      builtin: false,
    }))
    set((state) => ({
      presets: [...state.presets, ...imported],
      activePresetId: imported[0].id,
      comparisonView: 'active',
    }))
    return imported.length
  },
}))

export function getEffectiveArtDirectionValues(state = useArtDirectionStore.getState()) {
  if (state.runtimeValues) return state.runtimeValues
  return getSelectedArtDirectionValues(state)
}

export function getSelectedArtDirectionValues(state = useArtDirectionStore.getState()) {
  const requestedId = state.comparisonView === 'comparison'
    ? state.comparisonPresetId
    : state.activePresetId
  return state.presets.find((preset) => preset.id === requestedId)?.values
    ?? normalizeArtDirectionValues(DEFAULT_ART_DIRECTION_VALUES)
}

export function useArtDirectionValues() {
  return useArtDirectionStore((state) => getEffectiveArtDirectionValues(state))
}

export function getArtDirectionSunVector(values) {
  const azimuth = values.lighting.sunAzimuth * Math.PI / 180
  const elevation = values.lighting.sunElevation * Math.PI / 180
  const horizontal = Math.cos(elevation)
  return [
    Math.sin(azimuth) * horizontal,
    Math.sin(elevation),
    Math.cos(azimuth) * horizontal,
  ]
}

export function getArtDirectionColorMultiplier(surface, color) {
  const base = ART_DIRECTION_BASE_COLORS[surface] ?? '#ffffff'
  const parse = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
  const toLinear = (channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  )
  const baseChannels = parse(base).map(toLinear)
  const nextChannels = parse(normalizeColor(color, base)).map(toLinear)
  return nextChannels.map((channel, index) => (
    Math.min(4, Math.max(0, channel / Math.max(0.0001, baseChannels[index])))
  ))
}

export function serializeArtDirectionDocument() {
  return JSON.stringify(createArtDirectionDocument(), null, 2)
}

export function createArtDirectionDocument() {
  const state = useArtDirectionStore.getState()
  return {
    version: ART_DIRECTION_DOCUMENT_VERSION,
    exportedAt: new Date().toISOString(),
    activePresetId: state.activePresetId,
    comparisonPresetId: state.comparisonPresetId,
    presets: state.presets,
  }
}

export function applyArtDirectionDocument(document) {
  try {
    useArtDirectionStore.setState(createStateFromDocument(
      typeof document === 'string' ? JSON.parse(document) : document,
    ))
    return true
  } catch {
    return false
  }
}

export async function publishSharedDevArtDirection() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false
  const response = await window.fetch('/dev/art-direction', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(createArtDirectionDocument()),
  })
  return response.ok
}

export async function hydrateSharedDevArtDirection() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  if (params.has('editor')) return false
  try {
    const response = await window.fetch('/dev/art-direction', { cache: 'no-store' })
    if (!response.ok) return false
    return applyArtDirectionDocument(await response.json())
  } catch {
    return false
  }
}

useArtDirectionStore.subscribe((state, previousState) => {
  if (typeof window === 'undefined') return
  if (
    previousState &&
    state.presets === previousState.presets &&
    state.activePresetId === previousState.activePresetId &&
    state.comparisonPresetId === previousState.comparisonPresetId
  ) {
    return
  }
  try {
    window.localStorage.setItem(ART_DIRECTION_STORAGE_KEY, JSON.stringify({
      version: ART_DIRECTION_DOCUMENT_VERSION,
      activePresetId: state.activePresetId,
      comparisonPresetId: state.comparisonPresetId,
      presets: state.presets,
    }))
  } catch {
    // L'outil reste utilisable si le stockage privé ou le quota bloque localStorage.
  }
})

if (import.meta.env.DEV && typeof window !== 'undefined') {
  void hydrateSharedDevArtDirection()
}
