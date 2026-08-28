import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beginMapObjectAsset,
  collectMapObjectAssetEntries,
  getMapObjectAssetPipelineSnapshot,
  getMapObjectAssetStatus,
  isMapObjectAssetReady,
  markMapObjectAssetDecoded,
  markMapObjectAssetError,
  markMapObjectAssetReady,
  resetMapObjectAssetPipelineForTests,
  subscribeMapObjectAssetPipeline,
} from './mapObjectAssetPipeline'

vi.mock('../lib/perfDiagnostics', () => ({
  perfDiagnostics: { event: vi.fn() },
}))

const catalog = {
  tower: { modelUrl: '/tower.glb' },
  npc: { modelUrl: '/npc.fbx' },
  tree: { type: 'tree' },
}

describe('mapObjectAssetPipeline', () => {
  beforeEach(() => resetMapObjectAssetPipelineForTests())

  it('deduplicates URLs while retaining their object and placement identities', () => {
    const entries = collectMapObjectAssetEntries([
      { id: 'tower-a', objectId: 'tower' },
      { id: 'tower-b', objectId: 'tower' },
      { id: 'npc-a', objectId: 'npc' },
      { id: 'tree-a', objectId: 'tree' },
    ], (objectId) => catalog[objectId])

    expect(entries).toEqual([
      {
        url: '/tower.glb',
        extension: 'glb',
        objectIds: ['tower'],
        placements: [
          { id: 'tower-a', objectId: 'tower' },
          { id: 'tower-b', objectId: 'tower' },
        ],
      },
      {
        url: '/npc.fbx',
        extension: 'fbx',
        objectIds: ['npc'],
        placements: [{ id: 'npc-a', objectId: 'npc' }],
      },
    ])
  })

  it('only exposes an asset after loading, decoding and reveal have completed', () => {
    const [entry] = collectMapObjectAssetEntries(
      [{ id: 'tower-a', objectId: 'tower' }],
      (objectId) => catalog[objectId],
    )
    const subscriber = vi.fn()
    const unsubscribe = subscribeMapObjectAssetPipeline(subscriber)

    expect(isMapObjectAssetReady(entry.url)).toBe(false)
    expect(beginMapObjectAsset(entry)).toBe(true)
    expect(beginMapObjectAsset(entry)).toBe(false)
    expect(getMapObjectAssetStatus(entry.url)).toBe('loading')
    expect(markMapObjectAssetDecoded(entry)).toBe(true)
    expect(isMapObjectAssetReady(entry.url)).toBe(false)
    expect(markMapObjectAssetReady(entry)).toBe(true)
    expect(isMapObjectAssetReady(entry.url)).toBe(true)
    expect(getMapObjectAssetPipelineSnapshot([entry])).toMatchObject({ ready: 1, errors: 0 })
    expect(subscriber).toHaveBeenCalledTimes(3)

    unsubscribe()
  })

  it('settles failed assets without exposing them to the scene', () => {
    const [entry] = collectMapObjectAssetEntries(
      [{ id: 'npc-a', objectId: 'npc' }],
      (objectId) => catalog[objectId],
    )

    beginMapObjectAsset(entry)
    expect(markMapObjectAssetError(entry, new Error('broken asset'))).toBe(true)
    expect(getMapObjectAssetStatus(entry.url)).toBe('error')
    expect(isMapObjectAssetReady(entry.url)).toBe(false)
    expect(getMapObjectAssetPipelineSnapshot([entry])).toMatchObject({ ready: 0, errors: 1 })
  })
})
