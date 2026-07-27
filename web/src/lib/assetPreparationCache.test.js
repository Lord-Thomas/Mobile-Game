import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPreparedAssetCache,
  getOrCreatePreparedAsset,
  getPreparedAssetCacheSnapshot,
} from './assetPreparationCache'

describe('assetPreparationCache', () => {
  beforeEach(() => clearPreparedAssetCache())

  it('prepares a shared asset only once per namespace and key', () => {
    const prepare = vi.fn(() => ({ value: 42 }))
    const first = getOrCreatePreparedAsset('furniture', 'chair.glb', prepare)
    const second = getOrCreatePreparedAsset('furniture', 'chair.glb', prepare)

    expect(second).toBe(first)
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(getPreparedAssetCacheSnapshot().furniture.entries).toBe(1)
  })

  it('keeps namespaces isolated', () => {
    const furniture = getOrCreatePreparedAsset('furniture', 'shared.glb', () => 'chair')
    const map = getOrCreatePreparedAsset('map', 'shared.glb', () => 'tower')

    expect(furniture).toBe('chair')
    expect(map).toBe('tower')
  })
})

