import { useEffect, useMemo } from 'react'
import { DoubleSide } from 'three'
import { roadLayout } from './roads/roadLayout'
import { createRoadGeometry } from './roads/roadGeometry'
import OutdoorSurfaceMaterial from './OutdoorSurfaceMaterial'

function RoadMesh({ road, color = '#58616a', yOffset = 0.02, segments = 80 }) {
  const geometry = useMemo(
    () => createRoadGeometry(road.points, road.width, segments, yOffset),
    [road.points, road.width, segments, yOffset],
  )

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry} receiveShadow>
      <OutdoorSurfaceMaterial
        colorMap="/textures/outdoor/asphalt-clean-basecolor-512.jpg"
        repeat={[1, 1]}
        color={color}
        roughness={0.78}
        side={DoubleSide}
      />
    </mesh>
  )
}

function RoadCenterLine({ road }) {
  const lineRoad = useMemo(() => ({ ...road, width: 0.16 }), [road])
  return <RoadMesh road={lineRoad} color="#f1e7b7" yOffset={0.028} segments={80} />
}

function Road() {
  return (
    <group>
      <RoadMesh road={roadLayout.mainRoad} segments={96} />
      <RoadCenterLine road={roadLayout.mainRoad} />
    </group>
  )
}

export default Road
