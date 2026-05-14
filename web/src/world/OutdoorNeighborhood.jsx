import { Environment } from '@react-three/drei'
import OutdoorGround from './OutdoorGround'
import PlayerPlot from './PlayerPlot'
import Road from './Road'
import TerrainGroundCover from './TerrainGroundCover'
import DistantScenery from './DistantScenery'
import ProceduralTree from './trees/ProceduralTree'
import { AUTHORED_TREES } from './outdoorData'

export function OutdoorLighting({ active }) {
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

function OutdoorNeighborhood({ lightingActive = true, playerPositionRef, showAuthoredTrees = true }) {
  return (
    <>
      <OutdoorLighting active={lightingActive} />
      <OutdoorGround />
      <DistantScenery />
      <PlayerPlot />
      <Road />
      {showAuthoredTrees && AUTHORED_TREES.map((tree) => (
        <ProceduralTree key={tree.id} config={tree.config} />
      ))}
      <TerrainGroundCover playerPositionRef={playerPositionRef} />
    </>
  )
}

export default OutdoorNeighborhood
