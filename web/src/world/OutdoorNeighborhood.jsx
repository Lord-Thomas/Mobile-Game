import { Environment } from '@react-three/drei'
import OutdoorGround from './OutdoorGround'
import PlayerPlot from './PlayerPlot'
import Road from './Road'
import TerrainGroundCover from './TerrainGroundCover'
import DistantScenery from './DistantScenery'

function OutdoorLighting({ active }) {
  if (!active) return null

  return (
    <>
      <color attach="background" args={['#b9dff1']} />
      <fog attach="fog" args={['#b9dff1', 34, 88]} />
      <ambientLight intensity={0.64} />
      <hemisphereLight args={['#f7fbff', '#7da06a', 0.8]} />
      <directionalLight position={[14, 18, 8]} intensity={1.45} color="#fff8e6" castShadow />
      <Environment preset="park" />
    </>
  )
}

function OutdoorNeighborhood({ lightingActive = true }) {
  return (
    <>
      <OutdoorLighting active={lightingActive} />
      <OutdoorGround />
      <DistantScenery />
      <PlayerPlot />
      <Road />
      <TerrainGroundCover />
    </>
  )
}

export default OutdoorNeighborhood
