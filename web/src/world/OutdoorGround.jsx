import { useMemo } from 'react'
import NaturalTerrainMaterial from './NaturalTerrainMaterial'
import { createTerrainGeometry } from './terrain/terrainGeometry'

// Cache the geometries globally to prevent expensive re-generation
// and avoid main-thread freezes when entering/leaving the house
// or when switching to customization mode.
let cachedFullTerrain = null

function getCachedFullTerrain() {
  if (!cachedFullTerrain) {
    cachedFullTerrain = createTerrainGeometry()
  }
  return cachedFullTerrain
}

function OutdoorGround({ biomeAreas }) {
  const terrain = useMemo(() => getCachedFullTerrain(), [])

  // DO NOT dispose the cached geometries on unmount,
  // as they are reused across mounts.

  return (
    <group userData={{ debugCategory: 'terrain' }}>
      <mesh geometry={terrain.geometry} receiveShadow>
        <NaturalTerrainMaterial biomeAreas={biomeAreas} />
      </mesh>
    </group>
  )
}

export default OutdoorGround
