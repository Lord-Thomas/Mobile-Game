import { getRoomBounds, mainRoom, outsideDoorOpening } from './house/houseLayout'
import { MAIN_ROAD_Z } from './outdoorData'
import OutdoorSurfaceMaterial from './OutdoorSurfaceMaterial'

function DirtMaterial({ repeat }) {
  return (
    <OutdoorSurfaceMaterial
      colorMap="/textures/outdoor/dirt-ground-basecolor-512.jpg"
      repeat={repeat}
      color="#bfae83"
      roughness={0.88}
    />
  )
}

function PlayerPlot() {
  const fenceColor = '#e8d7ad'
  const mainBounds = getRoomBounds(mainRoom)
  const pathX = mainBounds.minX - 1.05
  const pathStartZ = outsideDoorOpening.centerZ
  const pathEndZ = MAIN_ROAD_Z - 1.1
  const pathCenterZ = (pathStartZ + pathEndZ) * 0.5
  const pathLength = pathEndZ - pathStartZ
  const gateMinX = pathX - 1.2
  const gateMaxX = pathX + 1.2

  return (
    <group>
      <mesh position={[pathX, -0.014, pathCenterZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.2, pathLength]} />
        <DirtMaterial repeat={[1, Math.max(1, pathLength / 4)]} />
      </mesh>
      <mesh position={[(pathX + mainBounds.minX) * 0.5, -0.013, pathStartZ]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[2.2, Math.abs(pathX - mainBounds.minX)]} />
        <DirtMaterial repeat={[1, 1]} />
      </mesh>

      {[-16, 16].map((x) => (
        <mesh key={`plot-side-${x}`} position={[x, 0.33, 0]}>
          <boxGeometry args={[0.18, 0.66, 21]} />
          <meshStandardMaterial color={fenceColor} roughness={0.72} />
        </mesh>
      ))}
      {[
        { center: (-16 + gateMinX) * 0.5, width: gateMinX + 16 },
        { center: (gateMaxX + 16) * 0.5, width: 16 - gateMaxX },
      ].filter((segment) => segment.width > 0.2).map((segment) => (
        <mesh key={`front-fence-${segment.center}`} position={[segment.center, 0.33, 16]}>
          <boxGeometry args={[segment.width, 0.66, 0.18]} />
          <meshStandardMaterial color={fenceColor} roughness={0.72} />
        </mesh>
      ))}

      {[-12.5, 10.5].map((x) => (
        <mesh key={`flower-${x}`} position={[x, -0.006, 9.2]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.34, 12]} />
          <meshStandardMaterial color={x < 0 ? '#f9d36a' : '#f28fb4'} roughness={0.78} />
        </mesh>
      ))}
    </group>
  )
}

export default PlayerPlot
