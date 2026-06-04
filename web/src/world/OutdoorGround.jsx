import { useMemo } from 'react'
import NaturalTerrainMaterial from './NaturalTerrainMaterial'
import { createTerrainGeometry } from './terrain/terrainGeometry'

// Cache the geometries globally to prevent expensive re-generation
// and avoid main-thread freezes when entering/leaving the house
// or when switching to customization mode.
let cachedFullTerrain = null
let cachedLightTerrain = null

function OutdoorGround({ detail = 'full' }) {
  const isLight = detail === 'light'
  
  const terrain = useMemo(() => {
    if (isLight) {
      if (!cachedLightTerrain) {
        cachedLightTerrain = createTerrainGeometry({ size: 128, segments: 48 })
      }
      return cachedLightTerrain
    } else {
      if (!cachedFullTerrain) {
        cachedFullTerrain = createTerrainGeometry()
      }
      return cachedFullTerrain
    }
  }, [isLight])

  // DO NOT dispose the cached geometries on unmount,
  // as they are reused across mounts.

  return (
    <group userData={{ debugCategory: 'terrain' }}>
      <mesh geometry={terrain.geometry} receiveShadow={!isLight}>
        {isLight ? (
          <meshStandardMaterial color="#7fa66a" roughness={0.95} />
        ) : (
          <NaturalTerrainMaterial />
        )}
      </mesh>
    </group>
  )
}

export default OutdoorGround
