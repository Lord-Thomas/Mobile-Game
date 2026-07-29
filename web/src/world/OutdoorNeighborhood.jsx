import React from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
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
import {
  getArtDirectionSunVector,
  useArtDirectionValues,
} from '../artDirection/artDirectionStore'

const OUTDOOR_SHADOW_FORWARD_OFFSET = 10
const OUTDOOR_SHADOW_LIGHT_DISTANCE = 42
const GRAVEYARD_ATMOSPHERE = BIOME_VISUALS.graveyard.atmosphere
const GRAVEYARD_SUN_COLOR = new Color(GRAVEYARD_ATMOSPHERE.sun)
const GRAVEYARD_SKY_LIGHT_COLOR = new Color(GRAVEYARD_ATMOSPHERE.sky)
const GRAVEYARD_GROUND_LIGHT_COLOR = new Color(GRAVEYARD_ATMOSPHERE.ground)
const DECOR_MAP_OBJECT_PLACEMENTS = MAP_OBJECT_PLACEMENTS.filter((placement) => (
  placement.objectId !== MAGIC_SKULL_DISCOVERY_OBJECT_ID
))

function snapShadowCenterToTexels(center, target, shadowBasis) {
  const right = Math.round(center.dot(shadowBasis.right) / shadowBasis.texelSize)
    * shadowBasis.texelSize
  const up = Math.round(center.dot(shadowBasis.up) / shadowBasis.texelSize)
    * shadowBasis.texelSize
  const depth = center.dot(shadowBasis.viewDirection)

  return target
    .copy(shadowBasis.right)
    .multiplyScalar(right)
    .addScaledVector(shadowBasis.up, up)
    .addScaledVector(shadowBasis.viewDirection, depth)
}

function getGraveyardAtmosphereInfluence(playerPositionRef, viewerOutside, active, biomeAreas) {
  const position = playerPositionRef?.current
  if (!active || !viewerOutside || !position) return 0
  return getBiomeInfluence('graveyard', position.x, position.z, 'fogIntensity', biomeAreas)
}

function OutdoorSun({
  castShadows,
  intensity,
  color,
  direction,
  shadowSettings,
  active,
  viewerOutside,
  playerPositionRef,
  biomeAreas,
}) {
  const lightRef = useRef()
  const targetRef = useRef()
  const influenceRef = useRef(0)
  const cameraForwardRef = useRef(new Vector3(0, 0, -1))
  const desiredCenterRef = useRef(new Vector3())
  const snappedCenterRef = useRef(new Vector3())
  const appliedCenterRef = useRef(new Vector3(Number.POSITIVE_INFINITY, 0, 0))
  const sunVector = useMemo(() => new Vector3(...direction).normalize(), [direction])
  const baseSunColor = useMemo(() => new Color(color), [color])
  const shadowBasis = useMemo(() => {
    const viewDirection = sunVector.clone().negate()
    const right = new Vector3().crossVectors(viewDirection, new Vector3(0, 1, 0)).normalize()
    const up = new Vector3().crossVectors(right, viewDirection).normalize()
    return {
      viewDirection,
      right,
      up,
      texelSize: (shadowSettings.extent * 2) / shadowSettings.mapSize,
    }
  }, [shadowSettings.extent, shadowSettings.mapSize, sunVector])
  const initialPosition = useMemo(
    () => sunVector.clone().multiplyScalar(OUTDOOR_SHADOW_LIGHT_DISTANCE).toArray(),
    [sunVector],
  )

  useEffect(() => {
    if (!lightRef.current || !targetRef.current) return
    lightRef.current.layers.set(OUTDOOR_LIGHT_LAYER)
    lightRef.current.target = targetRef.current
    lightRef.current.target.updateMatrixWorld()
  }, [])

  useEffect(() => {
    const light = lightRef.current
    if (!light?.shadow) return
    appliedCenterRef.current.set(Number.POSITIVE_INFINITY, 0, 0)
    light.shadow.map?.dispose()
    light.shadow.map = null
    light.shadow.needsUpdate = true
  }, [shadowBasis, shadowSettings.mapSize])

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
      const snappedCenter = snapShadowCenterToTexels(
        desiredCenter,
        snappedCenterRef.current,
        shadowBasis,
      )

      if (appliedCenterRef.current.distanceToSquared(snappedCenter) > 0.000001) {
        appliedCenterRef.current.copy(snappedCenter)
        target.position.copy(snappedCenter)
        light.position
          .copy(snappedCenter)
          .addScaledVector(sunVector, OUTDOOR_SHADOW_LIGHT_DISTANCE)
        target.updateMatrixWorld()
        light.updateMatrixWorld()
      }
    }

    const targetInfluence = getGraveyardAtmosphereInfluence(playerPositionRef, viewerOutside, active, biomeAreas)
    influenceRef.current = MathUtils.lerp(influenceRef.current, targetInfluence, 1 - Math.exp(-delta * 0.9))
    const influence = influenceRef.current
    light.intensity = intensity * (1 - influence * 0.38)
    light.color.copy(baseSunColor).lerp(GRAVEYARD_SUN_COLOR, influence)
  })

  return (
    <>
      <object3D ref={targetRef} />
      <directionalLight
        ref={lightRef}
        position={initialPosition}
        intensity={intensity}
        color={color}
        castShadow={active && castShadows && shadowSettings.enabled}
        shadow-intensity={castShadows && shadowSettings.enabled ? 1 : 0}
        shadow-mapSize={[shadowSettings.mapSize, shadowSettings.mapSize]}
        shadow-camera-left={-shadowSettings.extent}
        shadow-camera-right={shadowSettings.extent}
        shadow-camera-top={shadowSettings.extent}
        shadow-camera-bottom={-shadowSettings.extent}
        shadow-camera-near={3}
        shadow-camera-far={84}
        shadow-bias={shadowSettings.bias}
        shadow-normalBias={shadowSettings.normalBias}
        shadow-radius={shadowSettings.radius}
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
  const artDirection = useArtDirectionValues()
  const hemiRef = useRef()
  const hemiInfluenceRef = useRef(0)
  const sunAzimuth = artDirection.lighting.sunAzimuth
  const sunElevation = artDirection.lighting.sunElevation
  const sunDirection = useMemo(
    () => getArtDirectionSunVector({
      lighting: { sunAzimuth, sunElevation },
    }),
    [sunAzimuth, sunElevation],
  )
  const baseSkyLightColor = useMemo(
    () => new Color(artDirection.lighting.skyLightColor),
    [artDirection.lighting.skyLightColor],
  )
  const baseGroundLightColor = useMemo(
    () => new Color(artDirection.lighting.groundLightColor),
    [artDirection.lighting.groundLightColor],
  )
  const sunIntensity = active
    ? (viewerOutside
        ? artDirection.lighting.sunIntensity
        : artDirection.lighting.sunIntensity * (
          OUTDOOR_DAY_ATMOSPHERE.sunIntensityFromInside
          / OUTDOOR_DAY_ATMOSPHERE.sunIntensityOutside
        ))
    : 0
  const hemiIntensity = active
    ? (viewerOutside
        ? artDirection.lighting.hemisphereIntensity
        : artDirection.lighting.hemisphereIntensity * (
          OUTDOOR_DAY_ATMOSPHERE.hemisphereIntensityFromInside
          / OUTDOOR_DAY_ATMOSPHERE.hemisphereIntensityOutside
        ))
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
    hemi.color.copy(baseSkyLightColor).lerp(GRAVEYARD_SKY_LIGHT_COLOR, influence)
    hemi.groundColor.copy(baseGroundLightColor).lerp(GRAVEYARD_GROUND_LIGHT_COLOR, influence)
  })

  return (
    <>
      {showSky && active && (
        <CloudSky
          sunDirection={sunDirection}
          artDirection={artDirection}
          playerPositionRef={playerPositionRef}
          viewerOutside={viewerOutside}
          active={active}
          biomeAreas={biomeAreas}
        />
      )}
      <hemisphereLight
        ref={hemiRef}
        args={[
          artDirection.lighting.skyLightColor,
          artDirection.lighting.groundLightColor,
          hemiIntensity,
        ]}
        color={artDirection.lighting.skyLightColor}
      />
      <OutdoorSun
        castShadows={castShadows}
        intensity={sunIntensity}
        color={artDirection.lighting.sunColor}
        direction={sunDirection}
        shadowSettings={artDirection.shadows}
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
