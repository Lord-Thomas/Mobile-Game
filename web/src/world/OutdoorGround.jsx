import { OUTDOOR_WORLD_SIZE, PLAYER_PLOT_SIZE } from './outdoorData'
import OutdoorSurfaceMaterial from './OutdoorSurfaceMaterial'

function OutdoorGround() {
  return (
    <group>
      <mesh position={[0, -0.035, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[OUTDOOR_WORLD_SIZE, OUTDOOR_WORLD_SIZE]} />
        <OutdoorSurfaceMaterial
          colorMap="/textures/outdoor/grass-patchy-basecolor-512.jpg"
          repeat={[18, 18]}
          color="#9fbf7b"
          roughness={0.9}
        />
      </mesh>

      <mesh position={[0, -0.024, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[PLAYER_PLOT_SIZE, PLAYER_PLOT_SIZE]} />
        <OutdoorSurfaceMaterial
          colorMap="/textures/outdoor/grass-patchy-basecolor-512.jpg"
          repeat={[7, 7]}
          color="#a9c883"
          roughness={0.92}
        />
      </mesh>
    </group>
  )
}

export default OutdoorGround
