import { Environment } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import OutdoorGround from './OutdoorGround'
import PlayerPlot from './PlayerPlot'
import Road from './Road'
import TerrainGroundCover from './TerrainGroundCover'
import CloudSky from './CloudSky'
import ProceduralTree from './trees/ProceduralTree'
import { AUTHORED_TREES, DISTANT_TREES } from './outdoorData'

const OUTDOOR_SUN_DIRECTION = [0.62, 0.74, 0.2]

function OutdoorSun() {
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
        castShadow
        shadow-mapSize={[1024, 1024]}
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

export function OutdoorLighting({ active }) {
  if (!active) return null

  return (
    <>
      <color attach="background" args={['#d7edf6']} />
      <fog attach="fog" args={['#cfe7f1', 34, 92]} />
      <CloudSky sunDirection={OUTDOOR_SUN_DIRECTION} />
      <hemisphereLight args={['#f4fbff', '#6f8c54', 1.05]} />
      <OutdoorSun />
      <Environment preset="park" />
    </>
  )
}

function OutdoorNeighborhood({ lightingActive = true, playerPositionRef, showAuthoredTrees = true }) {
  return (
    <>
      <OutdoorLighting active={lightingActive} />
      <OutdoorGround />
      <PlayerPlot />
      <Road />
      {showAuthoredTrees && AUTHORED_TREES.map((tree) => (
        <ProceduralTree key={tree.id} config={tree.config} />
      ))}
      {DISTANT_TREES.map((tree) => (
        <ProceduralTree key={tree.id} config={tree.config} />
      ))}
      <TerrainGroundCover playerPositionRef={playerPositionRef} />
    </>
  )
}

export default OutdoorNeighborhood
