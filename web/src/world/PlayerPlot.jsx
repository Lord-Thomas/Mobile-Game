import { getRoomBounds, mainRoom } from './house/houseLayout'

function PlayerPlot() {
  const fenceColor = '#e8d7ad'
  const mainBounds = getRoomBounds(mainRoom)
  const pathX = mainBounds.minX - 1.05
  const gateMinX = pathX - 1.2
  const gateMaxX = pathX + 1.2

  return (
    <group>
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
        <mesh key={`flower-${x}`} position={[x, 0.04, 9.2]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.34, 12]} />
          <meshStandardMaterial color={x < 0 ? '#f9d36a' : '#f28fb4'} roughness={0.78} />
        </mesh>
      ))}
    </group>
  )
}

export default PlayerPlot
