import React from 'react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import OutdoorGround from './OutdoorGround'
import PlayerPlot from './PlayerPlot'
import Road from './Road'
import TerrainGroundCover from './TerrainGroundCover'
import CloudSky from './CloudSky'
import NeighborHouse from './NeighborHouse'
import InstancedTreeBatch from './trees/InstancedTreeBatch'
import MapObjectPlaceables from './MapObjectPlaceables'
import { AUTHORED_TREES, DISTANT_TREES, NEIGHBOR_HOUSES } from './outdoorData'
import { OUTDOOR_LIGHT_LAYER } from './lightingLayers'

const OUTDOOR_SUN_DIRECTION = [0.42, 0.9, 0.18]

function OutdoorSun({ castShadows, intensity }) {
  const lightRef = useRef()
  const targetRef = useRef()

  useEffect(() => {
    if (!lightRef.current || !targetRef.current) return
    lightRef.current.layers.set(OUTDOOR_LIGHT_LAYER)
    lightRef.current.target = targetRef.current
    lightRef.current.target.updateMatrixWorld()
  }, [])

  return (
    <>
      <object3D ref={targetRef} position={[-5, 0, 7]} />
      <directionalLight
        ref={lightRef}
        position={OUTDOOR_SUN_DIRECTION.map((value) => value * 32)}
        intensity={intensity}
        color="#fffaf0"
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

export function OutdoorLighting({ active, showSky, castShadows, viewerOutside = true }) {
  const hemiRef = useRef()
  const sunIntensity = active ? (viewerOutside ? 4.25 : 3.9) : 0
  const hemiIntensity = active ? (viewerOutside ? 2.65 : 2.25) : 0

  useEffect(() => {
    hemiRef.current?.layers.set(OUTDOOR_LIGHT_LAYER)
  }, [])

  return (
    <>
      {showSky && active && <CloudSky sunDirection={OUTDOOR_SUN_DIRECTION} />}
      <hemisphereLight ref={hemiRef} args={['#ffffff', '#a8d87b', hemiIntensity]} />
      <OutdoorSun castShadows={castShadows && active} intensity={sunIntensity} />
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
  showRoad = true,
  showNeighborHouses = true,
  showMapObjects = true,
  showSky = true,
  castShadows = true,
  viewerOutside = true,
  showPlayerPlot = false,
  debugStats = false,
}) {
  const groupRef = useRef()

  useLayoutEffect(() => {
    groupRef.current?.traverse((object) => {
      object.layers.set(OUTDOOR_LIGHT_LAYER)
    })
  })

  return (
    <group ref={groupRef} userData={{ debugCategory: 'outdoor' }}>
      <OutdoorLighting active={lightingActive} showSky={showSky} castShadows={castShadows} viewerOutside={viewerOutside} />
      {showTerrain && <OutdoorGround />}
      {showPlayerPlot && <PlayerPlot />}
      {showRoad && <Road />}
      {showNeighborHouses && NEIGHBOR_HOUSES.map((house) => (
        <NeighborHouse key={house.id} {...house} />
      ))}
      {showMapObjects && <MapObjectPlaceables />}
      {showTrees && showAuthoredTrees && <InstancedTreeBatch trees={AUTHORED_TREES} playerPositionRef={playerPositionRef} />}
      {showTrees && <InstancedTreeBatch trees={DISTANT_TREES} animated={false} forceSimplified />}
      {showGrass && <TerrainGroundCover playerPositionRef={playerPositionRef} ballRef={ballRef} active={lightingActive} debugStats={debugStats} />}
    </group>
  )
})

export default OutdoorNeighborhood
