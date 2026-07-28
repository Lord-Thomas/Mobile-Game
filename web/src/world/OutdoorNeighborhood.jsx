import React from 'react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, MathUtils, Vector3 } from 'three'
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
import { OUTDOOR_DAY_ATMOSPHERE } from './outdoorAtmosphere'

const OUTDOOR_SUN_DIRECTION = OUTDOOR_DAY_ATMOSPHERE.sunDirection
const OUTDOOR_SUN_VECTOR = new Vector3(...OUTDOOR_SUN_DIRECTION).normalize()
const OUTDOOR_SHADOW_MAP_SIZE = 512
const OUTDOOR_SHADOW_HALF_EXTENT = 24
const OUTDOOR_SHADOW_FORWARD_OFFSET = 10
const OUTDOOR_SHADOW_LIGHT_DISTANCE = 42
const OUTDOOR_SHADOW_TEXEL_SIZE = (OUTDOOR_SHADOW_HALF_EXTENT * 2) / OUTDOOR_SHADOW_MAP_SIZE
const OUTDOOR_SHADOW_VIEW_DIRECTION = OUTDOOR_SUN_VECTOR.clone().negate()
const OUTDOOR_SHADOW_RIGHT = new Vector3()
  .crossVectors(OUTDOOR_SHADOW_VIEW_DIRECTION, new Vector3(0, 1, 0))
  .normalize()
const OUTDOOR_SHADOW_UP = new Vector3()
  .crossVectors(OUTDOOR_SHADOW_RIGHT, OUTDOOR_SHADOW_VIEW_DIRECTION)
  .normalize()
const OUTDOOR_SUN_INITIAL_POSITION = OUTDOOR_SUN_VECTOR
  .clone()
  .multiplyScalar(OUTDOOR_SHADOW_LIGHT_DISTANCE)
  .toArray()
const BASE_SUN_COLOR = new Color(OUTDOOR_DAY_ATMOSPHERE.sunColor)
const BASE_SKY_LIGHT_COLOR = new Color(OUTDOOR_DAY_ATMOSPHERE.skyLightColor)
const BASE_GROUND_LIGHT_COLOR = new Color(OUTDOOR_DAY_ATMOSPHERE.groundLightColor)
const GRAVEYARD_ATMOSPHERE = BIOME_VISUALS.graveyard.atmosphere
const GRAVEYARD_SUN_COLOR = new Color(GRAVEYARD_ATMOSPHERE.sun)
const GRAVEYARD_SKY_LIGHT_COLOR = new Color(GRAVEYARD_ATMOSPHERE.sky)
const GRAVEYARD_GROUND_LIGHT_COLOR = new Color(GRAVEYARD_ATMOSPHERE.ground)
const DECOR_MAP_OBJECT_PLACEMENTS = MAP_OBJECT_PLACEMENTS.filter((placement) => (
  placement.objectId !== MAGIC_SKULL_DISCOVERY_OBJECT_ID
))

function snapShadowCenterToTexels(center, target) {
  const right = Math.round(center.dot(OUTDOOR_SHADOW_RIGHT) / OUTDOOR_SHADOW_TEXEL_SIZE)
    * OUTDOOR_SHADOW_TEXEL_SIZE
  const up = Math.round(center.dot(OUTDOOR_SHADOW_UP) / OUTDOOR_SHADOW_TEXEL_SIZE)
    * OUTDOOR_SHADOW_TEXEL_SIZE
  const depth = center.dot(OUTDOOR_SHADOW_VIEW_DIRECTION)

  return target
    .copy(OUTDOOR_SHADOW_RIGHT)
    .multiplyScalar(right)
    .addScaledVector(OUTDOOR_SHADOW_UP, up)
    .addScaledVector(OUTDOOR_SHADOW_VIEW_DIRECTION, depth)
}

function getGraveyardAtmosphereInfluence(playerPositionRef, viewerOutside, active, biomeAreas) {
  const position = playerPositionRef?.current
  if (!active || !viewerOutside || !position) return 0
  return getBiomeInfluence('graveyard', position.x, position.z, 'fogIntensity', biomeAreas)
}

function OutdoorSun({ castShadows, intensity, active, viewerOutside, playerPositionRef, biomeAreas }) {
  const lightRef = useRef()
  const targetRef = useRef()
  const influenceRef = useRef(0)
  const cameraForwardRef = useRef(new Vector3(0, 0, -1))
  const desiredCenterRef = useRef(new Vector3())
  const snappedCenterRef = useRef(new Vector3())
  const appliedCenterRef = useRef(new Vector3(Number.POSITIVE_INFINITY, 0, 0))

  useEffect(() => {
    if (!lightRef.current || !targetRef.current) return
    lightRef.current.layers.set(OUTDOOR_LIGHT_LAYER)
    lightRef.current.target = targetRef.current
    lightRef.current.target.updateMatrixWorld()
  }, [])

  useFrame(({ camera }, delta) => {
    const light = lightRef.current
    const target = targetRef.current
    if (!light || !target) return

    const playerPosition = playerPositionRef?.current
    if (playerPosition) {
      const cameraForward = camera.getWorldDirection(cameraForwardRef.current)
      cameraForward.y = 0
      if (cameraForward.lengthSq() < 0.0001) {
        cameraForward.set(0, 0, -1)
      } else {
        cameraForward.normalize()
      }

      const desiredCenter = desiredCenterRef.current
        .set(
          playerPosition.x,
          Number.isFinite(playerPosition.y) ? playerPosition.y : 0,
          playerPosition.z,
        )
        .addScaledVector(cameraForward, OUTDOOR_SHADOW_FORWARD_OFFSET)
      const snappedCenter = snapShadowCenterToTexels(desiredCenter, snappedCenterRef.current)

      if (appliedCenterRef.current.distanceToSquared(snappedCenter) > 0.000001) {
        appliedCenterRef.current.copy(snappedCenter)
        target.position.copy(snappedCenter)
        light.position
          .copy(snappedCenter)
          .addScaledVector(OUTDOOR_SUN_VECTOR, OUTDOOR_SHADOW_LIGHT_DISTANCE)
        target.updateMatrixWorld()
        light.updateMatrixWorld()
      }
    }

    const targetInfluence = getGraveyardAtmosphereInfluence(playerPositionRef, viewerOutside, active, biomeAreas)
    influenceRef.current = MathUtils.lerp(influenceRef.current, targetInfluence, 1 - Math.exp(-delta * 0.9))
    const influence = influenceRef.current
    light.intensity = intensity * (1 - influence * 0.38)
    light.color.copy(BASE_SUN_COLOR).lerp(GRAVEYARD_SUN_COLOR, influence)
  })

  return (
    <>
      <object3D ref={targetRef} />
      <directionalLight
        ref={lightRef}
        position={OUTDOOR_SUN_INITIAL_POSITION}
        intensity={intensity}
        color={OUTDOOR_DAY_ATMOSPHERE.sunColor}
        castShadow={active && castShadows}
        shadow-intensity={castShadows ? 1 : 0}
        shadow-mapSize={[OUTDOOR_SHADOW_MAP_SIZE, OUTDOOR_SHADOW_MAP_SIZE]}
        shadow-camera-left={-OUTDOOR_SHADOW_HALF_EXTENT}
        shadow-camera-right={OUTDOOR_SHADOW_HALF_EXTENT}
        shadow-camera-top={OUTDOOR_SHADOW_HALF_EXTENT}
        shadow-camera-bottom={-OUTDOOR_SHADOW_HALF_EXTENT}
        shadow-camera-near={3}
        shadow-camera-far={84}
        shadow-bias={-0.00025}
        shadow-normalBias={0.022}
        shadow-radius={1.35}
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
  const sunIntensity = active
    ? (viewerOutside
        ? OUTDOOR_DAY_ATMOSPHERE.sunIntensityOutside
        : OUTDOOR_DAY_ATMOSPHERE.sunIntensityFromInside)
    : 0
  const hemiIntensity = active
    ? (viewerOutside
        ? OUTDOOR_DAY_ATMOSPHERE.hemisphereIntensityOutside
        : OUTDOOR_DAY_ATMOSPHERE.hemisphereIntensityFromInside)
    : 0

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
      <hemisphereLight
        ref={hemiRef}
        args={[
          OUTDOOR_DAY_ATMOSPHERE.skyLightColor,
          OUTDOOR_DAY_ATMOSPHERE.groundLightColor,
          hemiIntensity,
        ]}
      />
      <OutdoorSun
        castShadows={castShadows}
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
  terrainRenderMode = 'full',
  showRoad = true,
  showNeighborHouses = true,
  showMapObjects = true,
  preloadMapObjects = false,
  onMapObjectsPreloaded = null,
  showBiomeEffects = true,
  showSky = true,
  castShadows = true,
  viewerOutside = true,
  showPlayerPlot = false,
  debugStats = false,
  reducedGrassDensity = false,
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
      {showTerrain && <OutdoorGround biomeAreas={biomeAreas} renderMode={terrainRenderMode} />}
      {showPlayerPlot && <PlayerPlot />}
      {showRoad && <Road />}
      {showNeighborHouses && NEIGHBOR_HOUSES.map((house) => (
        <NeighborHouse key={house.id} {...house} />
      ))}
      {preloadMapObjects && (
        <MapObjectAssetsPreloader
          objects={DECOR_MAP_OBJECT_PLACEMENTS}
          onReady={onMapObjectsPreloaded}
        />
      )}
      {showMapObjects && (
        <MapObjectPlaceables
          objects={DECOR_MAP_OBJECT_PLACEMENTS}
          batchStaticTrees
          showTrees={showTrees}
        />
      )}
      {showMapObjects && <PaintedPaths paths={MAP_PATHS} />}
      {showBiomeEffects && <BiomeAmbientEffects areas={biomeAreas} />}
      {showTrees && (
        <InstancedTreeBatch
          trees={DISTANT_TREES}
          animated={false}
          forceSimplified
          castShadows={false}
        />
      )}
      {showGrass && (
        <TerrainGroundCover
          playerPositionRef={playerPositionRef}
          ballRef={ballRef}
          active={lightingActive}
          debugStats={debugStats}
          reducedDensity={reducedGrassDensity}
          biomeAreas={biomeAreas}
        />
      )}
    </group>
  )
})

export default OutdoorNeighborhood
