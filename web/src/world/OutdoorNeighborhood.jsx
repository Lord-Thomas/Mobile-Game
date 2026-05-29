import React from 'react'
import { Environment } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import OutdoorGround from './OutdoorGround'
import PlayerPlot from './PlayerPlot'
import Road from './Road'
import TerrainGroundCover from './TerrainGroundCover'
import CloudSky from './CloudSky'
import NeighborHouse from './NeighborHouse'
import InstancedTreeBatch from './trees/InstancedTreeBatch'
import { AUTHORED_TREES, DISTANT_TREES, NEIGHBOR_HOUSES } from './outdoorData'

const OUTDOOR_SUN_DIRECTION = [0.62, 0.74, 0.2]

function OutdoorSun({ castShadows }) {
  const lightRef = useRef()
  const targetRef = useRef()

  useEffect(() => {
    if (!lightRef.current || !targetRef.current) return
    lightRef.current.target = targetRef.current
    lightRef.current.target.updateMatrixWorld()
  }, [])

  return (
    <>
      <object3D ref={targetRef} position={[-5, 0, 7]} />
      <directionalLight
        ref={lightRef}
        position={OUTDOOR_SUN_DIRECTION.map((value) => value * 32)}
        intensity={1.55}
        color="#fff1d2"
        castShadow={castShadows}
        shadow-mapSize={[512, 512]}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-camera-near={8}
        shadow-camera-far={62}
        shadow-bias={-0.00035}
        shadow-normalBias={0.028}
      />
    </>
  )
}

export function OutdoorLighting({ active, showSky, castShadows }) {
  if (!active) return null

  return (
    <>
      <color attach="background" args={['#d7edf6']} />
      <fog attach="fog" args={['#cfe7f1', 54, 170]} />
      {showSky && <CloudSky sunDirection={OUTDOOR_SUN_DIRECTION} />}
      <hemisphereLight args={['#f4fbff', '#6f8c54', 1.05]} />
      <OutdoorSun castShadows={castShadows} />
      <Environment preset="park" />
    </>
  )
}

const OutdoorNeighborhood = React.memo(function OutdoorNeighborhood({
  lightingActive = true,
  playerPositionRef,
  ballRef,
  showAuthoredTrees = true,
  showGrass = true,
  showTrees = true,
  showTerrain = true,
  showSky = true,
  castShadows = true,
  showPlayerPlot = false,
  debugStats = false,
}) {
  return (
    <group userData={{ debugCategory: 'outdoor' }}>
      <OutdoorLighting active={lightingActive} showSky={showSky} castShadows={castShadows} />
      {showTerrain && <OutdoorGround />}
      {showPlayerPlot && <PlayerPlot />}
      <Road />
      {NEIGHBOR_HOUSES.map((house) => (
        <NeighborHouse key={house.id} {...house} />
      ))}
      {showTrees && showAuthoredTrees && <InstancedTreeBatch trees={AUTHORED_TREES} playerPositionRef={playerPositionRef} />}
      {showTrees && <InstancedTreeBatch trees={DISTANT_TREES} animated={false} />}
      {showGrass && <TerrainGroundCover playerPositionRef={playerPositionRef} ballRef={ballRef} active={lightingActive} debugStats={debugStats} />}
    </group>
  )
})

export default OutdoorNeighborhood
