import { useEffect, useMemo } from 'react'
import NaturalTerrainMaterial from './NaturalTerrainMaterial'
import { createTerrainGeometry } from './terrain/terrainGeometry'

function OutdoorGround() {
  const terrain = useMemo(() => createTerrainGeometry(), [])

  useEffect(() => () => terrain.geometry.dispose(), [terrain.geometry])

  return (
    <group userData={{ debugCategory: 'terrain' }}>
      <mesh geometry={terrain.geometry} receiveShadow>
        <NaturalTerrainMaterial />
      </mesh>
    </group>
  )
}

export default OutdoorGround
