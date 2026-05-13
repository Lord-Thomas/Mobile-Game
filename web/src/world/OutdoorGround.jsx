import { OUTDOOR_WORLD_SIZE, PLAYER_PLOT_SIZE } from './outdoorData'

function OutdoorGround() {
  return (
    <group>
      <mesh position={[0, -0.035, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[OUTDOOR_WORLD_SIZE, OUTDOOR_WORLD_SIZE]} />
        <meshStandardMaterial color="#76a96d" roughness={0.88} />
      </mesh>

      <mesh position={[0, -0.024, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[PLAYER_PLOT_SIZE, PLAYER_PLOT_SIZE]} />
        <meshStandardMaterial color="#8fbd78" roughness={0.9} />
      </mesh>
    </group>
  )
}

export default OutdoorGround
