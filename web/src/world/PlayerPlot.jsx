import { PLAYER_PLOT_SIZE } from './outdoorData'

function PlayerPlot() {
  const halfSize = PLAYER_PLOT_SIZE * 0.5
  const dashLength = 0.72
  const dashGap = 0.42
  const dashY = 0.19
  const dashCenters = []
  const perimeterLength = PLAYER_PLOT_SIZE

  for (let offset = -halfSize + dashLength * 0.5; offset <= halfSize - dashLength * 0.5; offset += dashLength + dashGap) {
    dashCenters.push(offset)
  }

  return (
    <group userData={{ debugCategory: 'plot' }}>
      <mesh position={[0, 0.046, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[perimeterLength, perimeterLength]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.16} roughness={0.9} depthWrite={false} />
      </mesh>
      {dashCenters.map((offset) => (
        <group key={`plot-dash-${offset}`}>
          <mesh position={[offset, dashY, halfSize]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
            <planeGeometry args={[dashLength, 0.12]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.92} roughness={0.9} depthWrite={false} />
          </mesh>
          <mesh position={[offset, dashY, -halfSize]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
            <planeGeometry args={[dashLength, 0.12]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.92} roughness={0.9} depthWrite={false} />
          </mesh>
          <mesh position={[halfSize, dashY, offset]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} renderOrder={10}>
            <planeGeometry args={[dashLength, 0.12]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.92} roughness={0.9} depthWrite={false} />
          </mesh>
          <mesh position={[-halfSize, dashY, offset]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} renderOrder={10}>
            <planeGeometry args={[dashLength, 0.12]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.92} roughness={0.9} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

export default PlayerPlot
