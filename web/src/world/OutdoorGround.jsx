import { useMemo } from 'react'
import NaturalTerrainMaterial from './NaturalTerrainMaterial'
import { getCachedVisualGeometry } from './terrain/terrainGeometry'

function OutdoorGround({ biomeAreas }) {
  const terrain = useMemo(() => getCachedVisualGeometry(), [])

  return (
    <group userData={{ debugCategory: 'terrain' }}>
      <mesh geometry={terrain.geometry} receiveShadow>
        <NaturalTerrainMaterial biomeAreas={biomeAreas} />
      </mesh>
    </group>
  )
}

export default OutdoorGround
