import { beforeEach, describe, expect, it } from 'vitest'
import {
  ART_DIRECTION_STORAGE_KEY,
  DEFAULT_ART_DIRECTION_VALUES,
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
})
