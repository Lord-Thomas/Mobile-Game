import { beforeEach, describe, expect, it } from 'vitest'
import {
  ART_DIRECTION_STORAGE_KEY,
  BOSS_SLIME_PRESET_ID,
  DEFAULT_ART_DIRECTION_VALUES,
  applyArtDirectionDocument,
  createArtDirectionDocument,
  getEffectiveArtDirectionValues,
  normalizeArtDirectionValues,
  parseArtDirectionDocument,
  useArtDirectionStore,
} from './artDirectionStore'

describe('artDirectionStore', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ART_DIRECTION_STORAGE_KEY)
    }
    useArtDirectionStore.setState({
      comparisonView: 'active',
      runtimeValues: null,
    })
  })

  it('normalise les valeurs importées dans les limites sûres', () => {
    const values = normalizeArtDirectionValues({
      lighting: { sunIntensity: 99 },
      fog: { density: -1 },
      grading: { temperature: 7 },
      surfaces: { terrain: { color: 'invalid', roughness: 4 } },
    })

    expect(values.lighting.sunIntensity).toBe(12)
    expect(values.fog.density).toBe(0)
    expect(values.grading.temperature).toBe(1)
    expect(values.surfaces.terrain.color).toBe(DEFAULT_ART_DIRECTION_VALUES.surfaces.terrain.color)
    expect(values.surfaces.terrain.roughness).toBe(1)
  })

  it('accepte un preset JSON seul et une collection', () => {
    const single = parseArtDirectionDocument(JSON.stringify({
      name: 'Nuit',
      values: DEFAULT_ART_DIRECTION_VALUES,
    }))
    const collection = parseArtDirectionDocument({
      presets: [
        { name: 'A', values: DEFAULT_ART_DIRECTION_VALUES },
        { name: 'B', values: DEFAULT_ART_DIRECTION_VALUES },
      ],
    })

    expect(single).toHaveLength(1)
    expect(single[0].name).toBe('Nuit')
    expect(collection.map((preset) => preset.name)).toEqual(['A', 'B'])
  })

  it('rejette un document sans preset', () => {
    expect(() => parseArtDirectionDocument({ version: 1 })).toThrow(/aucun preset/i)
  })

  it('applique une ambiance temporaire sans remplacer le preset sélectionné', () => {
    const selectedPresetId = useArtDirectionStore.getState().activePresetId
    const runtimeValues = normalizeArtDirectionValues({
      grading: { exposure: 0.7 },
    })

    useArtDirectionStore.getState().setRuntimeValues(runtimeValues)
    expect(getEffectiveArtDirectionValues().grading.exposure).toBe(0.7)
    expect(useArtDirectionStore.getState().activePresetId).toBe(selectedPresetId)

    useArtDirectionStore.getState().setRuntimeValues(null)
    expect(useArtDirectionStore.getState().activePresetId).toBe(selectedPresetId)
  })

  it('applique un document partagé sans dupliquer les presets intégrés', () => {
    const source = createArtDirectionDocument()
    const daylight = source.presets.find((preset) => preset.id === 'factory-daylight')
    daylight.values.lighting.sunIntensity = 6.4

    expect(applyArtDirectionDocument(source)).toBe(true)
    const state = useArtDirectionStore.getState()
    expect(state.presets.find((preset) => preset.id === 'factory-daylight').values.lighting.sunIntensity).toBe(6.4)
    expect(state.presets.filter((preset) => preset.id === 'factory-daylight')).toHaveLength(1)
  })

  it('restaure la dernière ambiance normale après un aperçu boss sauvegardé', () => {
    const store = useArtDirectionStore.getState()
    const normalId = store.createPreset('Ambiance personnelle')
    store.setValue('sky.zenith', '#123456')
    store.selectPreset(BOSS_SLIME_PRESET_ID)
    const document = createArtDirectionDocument()

    expect(document.activePresetId).toBe(BOSS_SLIME_PRESET_ID)
    expect(document.normalPresetId).toBe(normalId)
    expect(applyArtDirectionDocument(document)).toBe(true)
    expect(useArtDirectionStore.getState().activePresetId).toBe(normalId)
    expect(getEffectiveArtDirectionValues().sky.zenith).toBe('#123456')
  })

  it('récupère une ancienne sauvegarde bloquée sur le preset boss', () => {
    expect(applyArtDirectionDocument({
      activePresetId: BOSS_SLIME_PRESET_ID,
      presets: [{ id: BOSS_SLIME_PRESET_ID, values: {} }],
    })).toBe(true)
    expect(useArtDirectionStore.getState().activePresetId).toBe('factory-daylight')
    expect(getEffectiveArtDirectionValues()).toEqual(DEFAULT_ART_DIRECTION_VALUES)
  })
})
