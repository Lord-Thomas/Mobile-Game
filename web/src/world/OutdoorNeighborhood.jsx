import React from 'react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, MathUtils } from 'three'
import OutdoorGround from './OutdoorGround'
import PlayerPlot from './PlayerPlot'
import Road from './Road'
import TerrainGroundCover from './TerrainGroundCover'
import CloudSky from './CloudSky'
import NeighborHouse from './NeighborHouse'
import InstancedTreeBatch from './trees/InstancedTreeBatch'
import MapObjectPlaceables, { MapObjectAssetsPreloader } from './MapObjectPlaceables'
import PaintedPaths from './PaintedPaths'
import { MAP_PATHS } from './paths'
import BiomeAmbientEffects from './BiomeAmbientEffects'
import { BIOME_VISUALS, MAP_BIOME_AREAS, getBiomeInfluence } from './biomeAreas'
import { MAGIC_SKULL_DISCOVERY_OBJECT_ID, MAP_OBJECT_PLACEMENTS } from './mapObjects'
import { DISTANT_TREES, NEIGHBOR_HOUSES } from './outdoorData'
import { OUTDOOR_LIGHT_LAYER } from './lightingLayers'

const OUTDOOR_SUN_DIRECTION = [0.42, 0.9, 0.18]
const BASE_SUN_COLOR = new Color('#fffaf0')
const BASE_SKY_LIGHT_COLOR = new Color('#ffffff')
const BASE_GROUND_LIGHT_COLOR = new Color('#a8d87b')
const GRAVEYARD_ATMOSPHERE = BIOME_VISUALS.graveyard.atmosphere
const GRAVEYARD_SUN_COLOR = new Color(GRAVEYARD_ATMOSPHERE.sun)
const GRAVEYARD_SKY_LIGHT_COLOR = new Color(GRAVEYARD_ATMOSPHERE.sky)
const GRAVEYARD_GROUND_LIGHT_COLOR = new Color(GRAVEYARD_ATMOSPHERE.ground)
const DECOR_MAP_OBJECT_PLACEMENTS = MAP_OBJECT_PLACEMENTS.filter((placement) => (
  placement.objectId !== MAGIC_SKULL_DISCOVERY_OBJECT_ID
))

function getGraveyardAtmosphereInfluence(playerPositionRef, viewerOutside, active, biomeAreas) {
  const position = playerPositionRef?.current
  if (!active || !viewerOutside || !position) return 0
  return getBiomeInfluence('graveyard', position.x, position.z, 'fogIntensity', biomeAreas)
}

function OutdoorSun({ castShadows, intensity, active, viewerOutside, playerPositionRef, biomeAreas }) {
  const lightRef = useRef()
  const targetRef = useRef()
  const influenceRef = useRef(0)

  useEffect(() => {
    if (!lightRef.current || !targetRef.current) return
    lightRef.current.layers.set(OUTDOOR_LIGHT_LAYER)
    lightRef.current.target = targetRef.current
    lightRef.current.target.updateMatrixWorld()
  }, [])

  useFrame((_, delta) => {
    const light = lightRef.current
    if (!light) return
    const targetInfluence = getGraveyardAtmosphereInfluence(playerPositionRef, viewerOutside, active, biomeAreas)
    influenceRef.current = MathUtils.lerp(influenceRef.current, targetInfluence, 1 - Math.exp(-delta * 0.9))
    const influence = influenceRef.current
    light.intensity = intensity * (1 - influence * 0.38)
    light.color.copy(BASE_SUN_COLOR).lerp(GRAVEYARD_SUN_COLOR, influence)
  })

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

export function OutdoorLighting({
  active,
  showSky,
  castShadows,
  viewerOutside = true,
  playerPositionRef,
  biomeAreas = MAP_BIOME_AREAS,
}) {
  const hemiRef = useRef()
  const hemiInfluenceRef = useRef(0)
  const sunIntensity = active ? (viewerOutside ? 4.25 : 3.9) : 0
  const hemiIntensity = active ? (viewerOutside ? 2.65 : 2.25) : 0

  useEffect(() => {
    hemiRef.current?.layers.set(OUTDOOR_LIGHT_LAYER)
  }, [])

  useFrame((_, delta) => {
    const hemi = hemiRef.current
    if (!hemi) return
    const targetInfluence = getGraveyardAtmosphereInfluence(playerPositionRef, viewerOutside, active, biomeAreas)
    hemiInfluenceRef.current = MathUtils.lerp(hemiInfluenceRef.current, targetInfluence, 1 - Math.exp(-delta * 0.9))
    const influence = hemiInfluenceRef.current
    hemi.intensity = hemiIntensity * (1 - influence * 0.28)
    hemi.color.copy(BASE_SKY_LIGHT_COLOR).lerp(GRAVEYARD_SKY_LIGHT_COLOR, influence)
    hemi.groundColor.copy(BASE_GROUND_LIGHT_COLOR).lerp(GRAVEYARD_GROUND_LIGHT_COLOR, influence)
  })

  return (
    <>
      {showSky && active && (
        <CloudSky
          sunDirection={OUTDOOR_SUN_DIRECTION}
          playerPositionRef={playerPositionRef}
          viewerOutside={viewerOutside}
          active={active}
          biomeAreas={biomeAreas}
        />
      )}
      <hemisphereLight ref={hemiRef} args={['#ffffff', '#a8d87b', hemiIntensity]} />
      <OutdoorSun
        castShadows={castShadows && active}
        intensity={sunIntensity}
        active={active}
        viewerOutside={viewerOutside}
        playerPositionRef={playerPositionRef}
        biomeAreas={biomeAreas}
      />
    </>
  )
}

const OutdoorNeighborhood = React.memo(function OutdoorNeighborhood({
  lightingActive = true,
  playerPositionRef,
  ballRef,
  showGrass = true,
  showTrees = true,
  showTerrain = true,
  showRoad = true,
  showNeighborHouses = true,
  showMapObjects = true,
  preloadMapObjects = false,
  showBiomeEffects = true,
  showSky = true,
  castShadows = true,
  viewerOutside = true,
  showPlayerPlot = false,
  debugStats = false,
  biomeAreas,
}) {
  const groupRef = useRef()

  useLayoutEffect(() => {
    groupRef.current?.traverse((object) => {
      object.layers.set(OUTDOOR_LIGHT_LAYER)
    })
  })

  return (
    <group ref={groupRef} userData={{ debugCategory: 'outdoor' }}>
      <OutdoorLighting
        active={lightingActive}
        showSky={showSky}
        castShadows={castShadows}
        viewerOutside={viewerOutside}
        playerPositionRef={playerPositionRef}
        biomeAreas={biomeAreas}
      />
      {showTerrain && <OutdoorGround biomeAreas={biomeAreas} />}
      {showPlayerPlot && <PlayerPlot />}
      {showRoad && <Road />}
      {showNeighborHouses && NEIGHBOR_HOUSES.map((house) => (
        <NeighborHouse key={house.id} {...house} />
      ))}
      {preloadMapObjects && !showMapObjects && (
        <MapObjectAssetsPreloader objects={DECOR_MAP_OBJECT_PLACEMENTS} />
      )}
      {showMapObjects && <MapObjectPlaceables objects={DECOR_MAP_OBJECT_PLACEMENTS} />}
      {showMapObjects && <PaintedPaths paths={MAP_PATHS} />}
      {showBiomeEffects && <BiomeAmbientEffects areas={biomeAreas} />}
      {showTrees && <InstancedTreeBatch trees={DISTANT_TREES} animated={false} forceSimplified />}
      {showGrass && (
        <TerrainGroundCover
          playerPositionRef={playerPositionRef}
          ballRef={ballRef}
          active={lightingActive}
          debugStats={debugStats}
          biomeAreas={biomeAreas}
        />
      )}
    </group>
  )
})

export default OutdoorNeighborhood
