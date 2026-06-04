import { useEffect, useMemo } from 'react'
import { roadLayout } from './roads/roadLayout'
import { createRoadGeometry } from './roads/roadGeometry'
import OutdoorSurfaceMaterial from './OutdoorSurfaceMaterial'
import { getTerrainHeight } from './terrain/terrainGeometry'

function RoadMesh({ road, color = '#58616a', yOffset = 0.028, segments = 80, lightweight = false }) {
  const geometry = useMemo(
    () => createRoadGeometry(road.points, road.width, segments, yOffset, getTerrainHeight),
    [road.points, road.width, segments, yOffset],
  )

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry} receiveShadow={!lightweight}>
      {lightweight ? (
        <meshStandardMaterial color={color} roughness={0.85} />
      ) : (
        <OutdoorSurfaceMaterial
          colorMap="/textures/outdoor/asphalt-clean-basecolor-512.jpg"
          repeat={[1, 1]}
          color={color}
          roughness={0.78}
        />
      )}
    </mesh>
  )
}

function RoadCenterLine({ road, lightweight = false }) {
  const lineRoad = useMemo(() => ({ ...road, width: 0.16 }), [road])
  return <RoadMesh road={lineRoad} color="#f1e7b7" yOffset={0.036} segments={lightweight ? 24 : 80} lightweight={lightweight} />
}

function Road({ lightweight = false }) {
  return (
    <group>
      <RoadMesh road={roadLayout.mainRoad} segments={lightweight ? 32 : 96} lightweight={lightweight} />
      <RoadCenterLine road={roadLayout.mainRoad} lightweight={lightweight} />
    </group>
  )
}

export default Road
