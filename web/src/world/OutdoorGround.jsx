import { useEffect, useMemo } from 'react'
import OutdoorSurfaceMaterial from './OutdoorSurfaceMaterial'
import { createTerrainGeometry } from './terrain/terrainGeometry'

function OutdoorGround() {
  const terrain = useMemo(() => createTerrainGeometry(), [])

  useEffect(() => () => terrain.geometry.dispose(), [terrain.geometry])

  return (
    <group>
      <mesh geometry={terrain.geometry} receiveShadow>
        <OutdoorSurfaceMaterial
          colorMap="/textures/outdoor/grass-patchy-basecolor-512.jpg"
          repeat={[7, 7]}
          color="#9fbf7b"
          roughness={0.9}
        />
      </mesh>
    </group>
  )
}

export default OutdoorGround
