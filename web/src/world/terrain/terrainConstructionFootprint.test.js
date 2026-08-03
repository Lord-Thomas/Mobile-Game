import { afterEach, describe, expect, it } from 'vitest'
import { getTerrainHeight, syncPlayerHouseTerrainFootprint } from './terrainGeometry'

describe('player house terrain footprint', () => {
  afterEach(() => syncPlayerHouseTerrainFootprint([]))

  it('keeps the base map natural until a construction supplies its footprint', () => {
    syncPlayerHouseTerrainFootprint([])
    const naturalHeight = getTerrainHeight(0, 0, true)

    syncPlayerHouseTerrainFootprint([{
      minX: -3,
      maxX: 3,
      minZ: -3,
      maxZ: 3,
    }])
    const constructedHeight = getTerrainHeight(0, 0, true)

    expect(constructedHeight).toBeCloseTo(-0.16, 5)
    expect(constructedHeight).not.toBeCloseTo(naturalHeight, 5)

    syncPlayerHouseTerrainFootprint([])
    expect(getTerrainHeight(0, 0, true)).toBeCloseTo(naturalHeight, 5)
  })
})
