import { useEffect, useMemo } from 'react'
import NaturalTerrainMaterial from './NaturalTerrainMaterial'
import { createTerrainGeometry } from './terrain/terrainGeometry'

function OutdoorGround({ detail = 'full' }) {
  const isLight = detail === 'light'
  const terrain = useMemo(
    () => createTerrainGeometry(isLight ? { size: 128, segments: 48 } : undefined),
    [isLight],
  )

  useEffect(() => () => terrain.geometry.dispose(), [terrain.geometry])

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
