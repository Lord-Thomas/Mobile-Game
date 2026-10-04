import { useEffect, useMemo, useRef } from 'react'
import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Box3, BufferGeometry, Color, Float32BufferAttribute, FrontSide, InstancedBufferAttribute, MathUtils, MeshBasicMaterial, Sphere, SRGBColorSpace, Vector3, Vector4 } from 'three'
import { getTerrainHeight, TERRAIN_HALF_SIZE } from './terrain/terrainGeometry'
import {
  BIOME_SHADER_MAX_AREAS,
  GRAVEYARD_SHADER_AREAS,
  GRAVEYARD_SHADER_GROUND_INTENSITIES,
  MAP_BIOME_AREAS,
  getBiomeInfluence,
  getBiomeShaderAreas,
} from './biomeAreas'
import { getDistanceToPath, getDistanceToRoad, getZoneDensity, isInsideHouseFootprint } from './worldZones'
import { ROAD_WIDTH } from './outdoorData'
import { MAP_PATH_SURFACE_SAMPLER } from './paths'
import { createChunkSlots, writeGrassSlot } from './grass/chunkSlots'
import { OUTDOOR_DAY_ATMOSPHERE } from './outdoorAtmosphere'
import {
  getArtDirectionColorMultiplier,
  useArtDirectionValues,
} from '../artDirection/artDirectionStore'

const _cameraForward = new Vector3()
const grassPlacementSettings = {
  rotationRandomness: Math.PI,
  positionJitter: 0.45,
  minScale: 0.18,
  maxScale: 0.3,
}
const GRASS_SCALE_RANGE = grassPlacementSettings.maxScale - grassPlacementSettings.minScale
const GRASS_AREA_MIN = -TERRAIN_HALF_SIZE
const GRASS_AREA_MAX = TERRAIN_HALF_SIZE
const GRASS_GRID_STEP = 0.22
const GRASS_DENSITY_MULTIPLIER = 7.5
const PAINTED_GRASS_DENSITY = 0.18
const GRASS_CHUNK_SIZE = 6
const GRASS_CHUNK_BUILD_TIME_BUDGET_MS = 1
const GRASS_ACTIVE_CHUNK_RADIUS = 5
// Terrain split into 4 quadrants — each gets its own instancedMesh so Three.js
// frustum-culls entire quadrants when they fall outside the camera view.
const QUADRANTS = [
  { id: 'ne', minX: 0,               maxX: TERRAIN_HALF_SIZE,  minZ: 0,               maxZ: TERRAIN_HALF_SIZE },
  { id: 'nw', minX: -TERRAIN_HALF_SIZE, maxX: 0,               minZ: 0,               maxZ: TERRAIN_HALF_SIZE },
  { id: 'se', minX: 0,               maxX: TERRAIN_HALF_SIZE,  minZ: -TERRAIN_HALF_SIZE, maxZ: 0 },
  { id: 'sw', minX: -TERRAIN_HALF_SIZE, maxX: 0,               minZ: -TERRAIN_HALF_SIZE, maxZ: 0 },
]
const GRASS_TEXTURE = '/textures/outdoor/grass-001-white.png'
const grassBottomColor = new Color('#339632')
const grassMiddleColor = new Color('#59bd36')
const grassTopColor = new Color('#8fd642')
const grassSunColorGlsl = new Color(OUTDOOR_DAY_ATMOSPHERE.sunColor)
  .toArray()
  .map((value) => value.toFixed(3))
  .join(', ')
const grassSkyColorGlsl = new Color(OUTDOOR_DAY_ATMOSPHERE.skyLightColor)
  .toArray()
  .map((value) => value.toFixed(3))
  .join(', ')
const grassGroundColorGlsl = new Color(OUTDOOR_DAY_ATMOSPHERE.groundLightColor)
  .toArray()
  .map((value) => value.toFixed(3))
  .join(', ')
const GRASS_CARD_HEIGHT = 0.78
const GRASS_VERTICAL_SEGMENTS = 1
const GRASS_FULL_DENSITY_RADIUS = 10
const GRASS_THINNING_RADIUS = 150
const GRASS_MIN_KEEP_PROBABILITY = 0.015
const GRASS_CULL_FADE_START = 150
const GRASS_CULL_RADIUS = TERRAIN_HALF_SIZE * 1.42
const GRASS_LOCAL_FADE_START = 16
const GRASS_LOCAL_FADE_END = 22
const GRASS_CHUNK_REVEAL_DURATION = 0.9
const GRASS_CHUNK_REVEAL_STAGGER = 0.35
const GRASS_FAR_WIDTH_SCALE = 1.65
const GRASS_FAR_HEIGHT_SCALE = 1.08
const grassWindSettings = {
  strength: 0.13,
  speed: 1.05,
  scale: 0.34,
  directionX: 0.86,
  directionZ: 0.5,
}
const grassInteractionSettings = {
  radius: 0.85,
  strength: 0.82,
}
const grassGraveyardShaderAreas = Array.from({ length: BIOME_SHADER_MAX_AREAS }, (_, index) => (
  GRAVEYARD_SHADER_AREAS[index] ?? new Vector4(0, 0, 0, 1)
))
const grassGraveyardGroundIntensities = Float32Array.from(Array.from({ length: BIOME_SHADER_MAX_AREAS }, (_, index) => (
  GRAVEYARD_SHADER_GROUND_INTENSITIES[index] ?? 0
)))

function getGrassBiomeShaderData(biomeAreas = MAP_BIOME_AREAS) {
  if (biomeAreas === MAP_BIOME_AREAS) {
    return {
      areas: grassGraveyardShaderAreas,
      groundIntensities: grassGraveyardGroundIntensities,
      count: Math.min(GRAVEYARD_SHADER_AREAS.length, BIOME_SHADER_MAX_AREAS),
    }
  }

  const areas = getBiomeShaderAreas('graveyard', biomeAreas)
  const graveyardAreas = biomeAreas
    .filter((area) => area.biome === 'graveyard')
    .slice(0, BIOME_SHADER_MAX_AREAS)

  return {
    areas: Array.from({ length: BIOME_SHADER_MAX_AREAS }, (_, index) => (
      areas[index] ?? new Vector4(0, 0, 0, 1)
    )),
    groundIntensities: Float32Array.from(Array.from({ length: BIOME_SHADER_MAX_AREAS }, (_, index) => (
      graveyardAreas[index]?.groundIntensity ?? 0
    ))),
    count: Math.min(areas.length, BIOME_SHADER_MAX_AREAS),
  }
}

function softenGrassNormals(geometry, upStrength = 0.65) {
  if (!geometry.attributes.normal) geometry.computeVertexNormals()

  const normals = geometry.attributes.normal.array
  const normal = new Vector3()
  const up = new Vector3(0, 1, 0)

  for (let index = 0; index < normals.length; index += 3) {
    normal.set(normals[index], normals[index + 1], normals[index + 2])
    normal.lerp(up, upStrength).normalize()
    normals[index] = normal.x
    normals[index + 1] = normal.y
    normals[index + 2] = normal.z
  }

  geometry.attributes.normal.needsUpdate = true
}

function createGrassCardGeometry() {
  const width = 1.08
  const height = GRASS_CARD_HEIGHT
  const positions = []
  const uvs = []
  const colors = []
  const indices = []

  // Single card along the X axis — the vertex shader rotates it toward the camera each frame
  // (cylindrical billboard: always face the camera horizontally, stays vertical like real grass)
  for (let row = 0; row <= GRASS_VERTICAL_SEGMENTS; row += 1) {
    const verticalT = row / GRASS_VERTICAL_SEGMENTS
    const y = height * verticalT
    const v = verticalT

    ;[
      [-width * 0.5, 0],
      [width * 0.5, 1],
    ].forEach(([x, u]) => {
      positions.push(x, y, 0)
      uvs.push(u, v)
      const color = verticalT < 0.55
        ? grassBottomColor.clone().lerp(grassMiddleColor, verticalT / 0.55)
        : grassMiddleColor.clone().lerp(grassTopColor, (verticalT - 0.55) / 0.45)
      colors.push(color.r, color.g, color.b)
    })
  }

  for (let row = 0; row < GRASS_VERTICAL_SEGMENTS; row += 1) {
    const a = row * 2
    const b = a + 1
    const c = a + 2
    const d = a + 3
    indices.push(a, b, c)
    indices.push(b, d, c)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  softenGrassNormals(geometry, 0.65)
  return geometry
}

function seededRandom(seed) {
  return MathUtils.euclideanModulo(Math.sin(seed * 12.9898) * 43758.5453, 1)
}

function grassHash2(x, z) {
  return MathUtils.euclideanModulo(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453123, 1)
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function makeGrassInstance(x, z, seed) {
  const h = getTerrainHeight(x, z)
  return {
    position: [x, h + 0.04, z],
    rotation: [0, (seededRandom(seed + 18) - 0.5) * grassPlacementSettings.rotationRandomness * 2, 0],
    scale: grassPlacementSettings.minScale + seededRandom(seed + 9) * GRASS_SCALE_RANGE,
    colorShift: seededRandom(seed + 41),
  }
}

function pushGrassRow(grass, xi, minZ, maxZ, step = GRASS_GRID_STEP) {
  for (let zi = minZ; zi <= maxZ; zi += step) {
    const seed = (xi + 61) * 197 + (zi + 43) * 137
    const x = xi + (seededRandom(seed) - 0.5) * grassPlacementSettings.positionJitter * 2
    const z = zi + (seededRandom(seed + 5) - 0.5) * grassPlacementSettings.positionJitter * 2
    const graveyardInfluence = getBiomeInfluence('graveyard', x, z, null)
    if (graveyardInfluence > 0.28) continue
    const livingCoverMultiplier = Math.pow(1 - graveyardInfluence, 3.5)
    const gameplayDensity = Math.max(getZoneDensity('tall_grass', x, z), getZoneDensity('lawn_blade', x, z) * 0.9)
    const visualDensity = getVisualGrassDensity(x, z) * livingCoverMultiplier
    const { naturalWeight, grassWeight } = MAP_PATH_SURFACE_SAMPLER.sampleGrassWeights(x, z)
    const density = Math.min(1, (
      Math.max(gameplayDensity, visualDensity) * naturalWeight
      + PAINTED_GRASS_DENSITY * grassWeight * livingCoverMultiplier
    ) * GRASS_DENSITY_MULTIPLIER)
    if (seededRandom(seed + 19) < density) grass.push(makeGrassInstance(x, z, seed))
  }
}

function getVisualGrassDensity(x, z) {
  if (isInsideHouseFootprint(x, z, 0.9)) return 0

  const roadDistance = getDistanceToRoad(x, z)
  const pathDistance = getDistanceToPath(x, z)
  const roadFade = smoothstep(ROAD_WIDTH * 0.5 + 1.1, ROAD_WIDTH * 0.5 + 4.2, roadDistance)
  const pathFade = smoothstep(0.7, 3.6, pathDistance)
  const maxAxis = Math.max(Math.abs(x), Math.abs(z))
  const terrainEdgeFade = 1 - smoothstep(TERRAIN_HALF_SIZE - 4, TERRAIN_HALF_SIZE, maxAxis)
  const outsidePlayableBoost = smoothstep(34, 44, maxAxis)

  return 0.18 * roadFade * pathFade * terrainEdgeFade * (0.72 + outsidePlayableBoost * 0.28)
}

function getGrassChunkBounds(chunkX, chunkZ) {
  const minX = Math.max(GRASS_AREA_MIN, chunkX * GRASS_CHUNK_SIZE)
  const maxX = Math.min(GRASS_AREA_MAX, minX + GRASS_CHUNK_SIZE)
  const minZ = Math.max(GRASS_AREA_MIN, chunkZ * GRASS_CHUNK_SIZE)
  const maxZ = Math.min(GRASS_AREA_MAX, minZ + GRASS_CHUNK_SIZE)
  return { minX, maxX, minZ, maxZ }
}

function getGrassChunkIndex(value) {
  return Math.floor(value / GRASS_CHUNK_SIZE)
}

function getGrassChunkKey(chunkX, chunkZ) {
  return `${chunkX}:${chunkZ}`
}

function getChunkQuadrantIndex(chunkX, chunkZ) {
  const centerX = (chunkX + 0.5) * GRASS_CHUNK_SIZE
  const centerZ = (chunkZ + 0.5) * GRASS_CHUNK_SIZE
  return (centerX >= 0 ? 0 : 1) + (centerZ >= 0 ? 0 : 2)
}

function getAllGrassChunkKeys() {
  const keys = []
  const minChunkX = getGrassChunkIndex(GRASS_AREA_MIN)
  const maxChunkX = getGrassChunkIndex(GRASS_AREA_MAX)
  const minChunkZ = getGrassChunkIndex(GRASS_AREA_MIN)
  const maxChunkZ = getGrassChunkIndex(GRASS_AREA_MAX)

  for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
    for (let chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ += 1) {
      const bounds = getGrassChunkBounds(chunkX, chunkZ)
      if (bounds.maxX < bounds.minX || bounds.maxZ < bounds.minZ) continue
      keys.push(getGrassChunkKey(chunkX, chunkZ))
    }
  }

  return keys
}

function getGrassChunkDistance(key, centerChunkX, centerChunkZ) {
  const [chunkX, chunkZ] = key.split(':').map(Number)
  return Math.max(Math.abs(chunkX - centerChunkX), Math.abs(chunkZ - centerChunkZ))
}

function getActiveGrassChunkKeys(
  allKeys,
  centerChunkX,
  centerChunkZ,
  radius = GRASS_ACTIVE_CHUNK_RADIUS,
) {
  return allKeys
    .filter((key) => getGrassChunkDistance(key, centerChunkX, centerChunkZ) <= radius)
    .sort((a, b) => getGrassChunkDistance(a, centerChunkX, centerChunkZ) - getGrassChunkDistance(b, centerChunkX, centerChunkZ))
}

function createGrassChunkBuildJob(key, step = GRASS_GRID_STEP) {
  const [chunkX, chunkZ] = key.split(':').map(Number)
  const bounds = getGrassChunkBounds(chunkX, chunkZ)
  return {
    key,
    bounds,
    nextX: bounds.minX,
    step,
    grass: [],
    buildTimeMs: 0,
  }
}

function continueGrassChunkBuild(job, deadline) {
  const sliceStartedAt = typeof performance !== 'undefined' ? performance.now() : 0
  while (job.nextX <= job.bounds.maxX) {
    pushGrassRow(job.grass, job.nextX, job.bounds.minZ, job.bounds.maxZ, job.step)
    job.nextX += job.step
    if (typeof performance !== 'undefined' && performance.now() >= deadline) {
      job.buildTimeMs += performance.now() - sliceStartedAt
      return false
    }
  }
  if (typeof performance !== 'undefined') job.buildTimeMs += performance.now() - sliceStartedAt
  return true
}

function buildGrassHandleBeforeCompile(onShaderReady, getBiomeData = () => getGrassBiomeShaderData()) {
  return (shader) => {
    const biomeData = getBiomeData()
    shader.uniforms.uTime = { value: 0 }
    shader.uniforms.uPlayerPosition = { value: new Vector3(9999, 0, 9999) }
    shader.uniforms.uBallPosition = { value: new Vector3(9999, 0, 9999) }
    shader.uniforms.uBallInteractionRadius = { value: 0.55 }
    shader.uniforms.uBladeHeight = { value: GRASS_CARD_HEIGHT }
    shader.uniforms.uWindStrength = { value: grassWindSettings.strength }
    shader.uniforms.uWindSpeed = { value: grassWindSettings.speed }
    shader.uniforms.uWindScale = { value: grassWindSettings.scale }
    shader.uniforms.uInteractionRadius = { value: grassInteractionSettings.radius }
    shader.uniforms.uInteractionStrength = { value: grassInteractionSettings.strength }
    shader.uniforms.uFullDensityRadius = { value: GRASS_FULL_DENSITY_RADIUS }
    shader.uniforms.uThinningRadius = { value: GRASS_THINNING_RADIUS }
    shader.uniforms.uMinKeepProbability = { value: GRASS_MIN_KEEP_PROBABILITY }
    shader.uniforms.uCullFadeStart = { value: GRASS_CULL_FADE_START }
    shader.uniforms.uCullRadius = { value: GRASS_CULL_RADIUS }
    shader.uniforms.uFarWidthScale = { value: GRASS_FAR_WIDTH_SCALE }
    shader.uniforms.uFarHeightScale = { value: GRASS_FAR_HEIGHT_SCALE }
    shader.uniforms.uWindDirection = {
      value: new Vector3(grassWindSettings.directionX, 0, grassWindSettings.directionZ).normalize(),
    }
    shader.uniforms.uCameraForward = { value: new Vector3(0, 0, -1) }
    shader.uniforms.uGraveyardAreas = { value: biomeData.areas }
    shader.uniforms.uGraveyardGroundIntensities = { value: biomeData.groundIntensities }
    shader.uniforms.uGraveyardAreaCount = { value: biomeData.count }
    shader.uniforms.uArtGrassRoughness = { value: 0.82 }

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `
      #include <common>

      uniform float uTime;
      uniform float uBladeHeight;
      uniform float uWindStrength;
      uniform float uWindSpeed;
      uniform float uWindScale;
      uniform float uInteractionRadius;
      uniform float uInteractionStrength;
      uniform float uFullDensityRadius;
      uniform float uThinningRadius;
      uniform float uMinKeepProbability;
      uniform float uCullFadeStart;
      uniform float uCullRadius;
      uniform float uFarWidthScale;
      uniform float uFarHeightScale;
      uniform vec3 uPlayerPosition;
      uniform vec3 uBallPosition;
      uniform float uBallInteractionRadius;
      uniform vec3 uWindDirection;
      uniform vec3 uCameraForward;
      uniform vec4 uGraveyardAreas[${BIOME_SHADER_MAX_AREAS}];
      uniform float uGraveyardGroundIntensities[${BIOME_SHADER_MAX_AREAS}];
      uniform int uGraveyardAreaCount;
      attribute float instanceSpawnTime;
      varying vec3 vOutdoorGrassLight;
      varying float vOutdoorGrassHighlight;

      float grassHash(vec2 value) {
        return fract(sin(dot(value, vec2(12.9898, 78.233))) * 43758.5453123);
      }

      float grassBiomeAreaInfluence(vec2 worldPosition, vec4 area) {
        float distanceToCenter = distance(worldPosition, area.xy);
        float innerRadius = max(0.0, area.z - area.w);
        return 1.0 - smoothstep(innerRadius, area.z, distanceToCenter);
      }

      float grassGraveyardInfluence(vec2 worldPosition) {
        float influence = 0.0;
        for (int i = 0; i < ${BIOME_SHADER_MAX_AREAS}; i++) {
          if (i >= uGraveyardAreaCount) break;
          influence = max(influence, grassBiomeAreaInfluence(worldPosition, uGraveyardAreas[i]) * uGraveyardGroundIntensities[i]);
        }
        return clamp(influence, 0.0, 1.0);
      }
      `,
    )

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>

      // Cylindrical billboard: rotate the card to face the camera around the Y axis.
      // position.x holds the horizontal half-width offset; we redirect it along the
      // camera's perpendicular so the blade always shows its face, never its edge.
      vec2 camRight = vec2(-uCameraForward.z, uCameraForward.x);
      float localX = transformed.x;
      transformed.x = localX * camRight.x;
      transformed.z = localX * camRight.y;

      float heightFactor = clamp(position.y / uBladeHeight, 0.0, 1.0);
      heightFactor = heightFactor * heightFactor;

      #ifdef USE_INSTANCING
        vec3 grassOrigin = vec3(instanceMatrix[3].x, instanceMatrix[3].y, instanceMatrix[3].z);
      #else
        vec3 grassOrigin = vec3(0.0);
      #endif
      float graveyardGrassCull = smoothstep(0.18, 0.42, grassGraveyardInfluence(grassOrigin.xz));
      float grassLightVariation = 0.88 + grassHash(grassOrigin.xz + vec2(5.3, 8.7)) * 0.12;
      vec3 grassAmbientLight = mix(
        vec3(${grassGroundColorGlsl}),
        vec3(${grassSkyColorGlsl}),
        0.58 + heightFactor * 0.34
      ) * 0.82;
      vec3 grassSunLight = vec3(${grassSunColorGlsl})
        * (0.14 + heightFactor * 0.10)
        * grassLightVariation;
      vOutdoorGrassLight = clamp(
        grassAmbientLight + grassSunLight,
        vec3(0.48, 0.62, 0.42),
        vec3(1.06, 1.12, 0.96)
      );
      vOutdoorGrassHighlight = heightFactor * grassLightVariation;

      float travel = dot(grassOrigin.xz, uWindDirection.xz) * uWindScale;
      float cross = dot(grassOrigin.xz, vec2(-uWindDirection.z, uWindDirection.x)) * 0.06;
      float windPhase = uTime * uWindSpeed - travel + cross;
      float mainWave = 0.5 + 0.5 * sin(windPhase);
      float detailWave = 0.5 + 0.5 * sin(windPhase * 2.37 + grassOrigin.x * 0.11 + grassOrigin.z * 0.07);
      float wind = 0.18 + 0.82 * mix(mainWave, detailWave, 0.16);

      transformed.x += uWindDirection.x * wind * uWindStrength * heightFactor;
      transformed.z += uWindDirection.z * wind * uWindStrength * heightFactor;

      // Tip lean: each blade leans in a unique seeded direction so tips scatter
      // outward in all directions — fills gaps between blades when viewed from above.
      float tiltT = clamp(position.y / uBladeHeight, 0.0, 1.0);
      float leanAngle = grassHash(grassOrigin.xz + vec2(3.7, 1.9)) * 6.28318;
      transformed.x += cos(leanAngle) * tiltT * 0.6;
      transformed.z += sin(leanAngle) * tiltT * 0.6;

      vec2 fromPlayer = grassOrigin.xz - uPlayerPosition.xz;
      float playerDistance = length(fromPlayer);
      float distanceSq = dot(fromPlayer, fromPlayer);
      float fullDensityRadiusSq = uFullDensityRadius * uFullDensityRadius;
      float thinningRadiusSq = uThinningRadius * uThinningRadius;
      float thinningT = clamp(
        (distanceSq - fullDensityRadiusSq) / max(thinningRadiusSq - fullDensityRadiusSq, 0.0001),
        0.0,
        1.0
      );
      float keepProbability = mix(1.0, uMinKeepProbability, thinningT);
      float transitionOffset = (grassHash(grassOrigin.xz + vec2(7.3, 2.1)) - 0.5) * 8.0;
      float horizonFade = 1.0 - smoothstep(
        uCullFadeStart + transitionOffset * 2.0,
        uCullRadius + transitionOffset * 2.0,
        playerDistance
      );
      float localFade = 1.0 - smoothstep(
        ${GRASS_LOCAL_FADE_START.toFixed(1)} + transitionOffset,
        ${GRASS_LOCAL_FADE_END.toFixed(1)} + transitionOffset,
        playerDistance
      );
      float layerFade = localFade;
      keepProbability *= horizonFade * layerFade;

      // Distant blades represent small clusters: fewer instances, slightly wider cards.
      // The curve stays gradual so there is no visible LOD transition.
      float clusterT = thinningT * thinningT;
      float widthScale = uFarWidthScale;
      float heightScale = uFarHeightScale;
      transformed.x *= mix(1.0, widthScale, clusterT);
      transformed.y *= mix(1.0, heightScale, clusterT);

      float keep = step(grassHash(grassOrigin.xz), keepProbability);
      keep *= 1.0 - graveyardGrassCull;


      // Newly streamed local chunks grow in progressively instead of appearing at once.
      float spawnTime = instanceSpawnTime;
      float revealDelay = grassHash(grassOrigin.xz + vec2(4.1, 9.7)) * ${GRASS_CHUNK_REVEAL_STAGGER.toFixed(2)};
      float reveal = smoothstep(
        0.0,
        ${GRASS_CHUNK_REVEAL_DURATION.toFixed(2)},
        uTime - spawnTime - revealDelay
      );
      float revealGrowth = smoothstep(0.0, 1.0, reveal);
      transformed.x *= mix(0.78, 1.0, revealGrowth);
      transformed.z *= mix(0.78, 1.0, revealGrowth);
      // Keep a valid card below the ground at the beginning. Collapsing it to
      // zero height creates degenerate triangles that can flicker against the terrain.
      transformed.y *= mix(0.35, 1.0, revealGrowth);
      transformed.y -= (1.0 - revealGrowth) * 0.58;
      transformed.y -= (1.0 - keep) * 1000.0;


      float playerInfluence = smoothstep(uInteractionRadius, 0.0, playerDistance) * heightFactor;

      if (playerDistance > 0.0001) {
        vec2 pushDirection = normalize(fromPlayer);
        transformed.x += pushDirection.x * uInteractionStrength * playerInfluence;
        transformed.z += pushDirection.y * uInteractionStrength * playerInfluence;
        transformed.y -= uInteractionStrength * 0.06 * playerInfluence;
      }

      vec2 fromBall = grassOrigin.xz - uBallPosition.xz;
      float ballDistance = length(fromBall);
      float ballInfluence = smoothstep(uBallInteractionRadius, 0.0, ballDistance) * heightFactor;
      if (ballDistance > 0.0001) {
        vec2 ballPushDir = normalize(fromBall);
        transformed.x += ballPushDir.x * uInteractionStrength * ballInfluence;
        transformed.z += ballPushDir.y * uInteractionStrength * ballInfluence;
        transformed.y -= uInteractionStrength * 0.06 * ballInfluence;
      }
`,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `
      #include <common>
      uniform float uArtGrassRoughness;
      varying vec3 vOutdoorGrassLight;
      varying float vOutdoorGrassHighlight;
      `,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      #include <map_fragment>
      diffuseColor.rgb *= vOutdoorGrassLight;
      float artGrassSheen = pow(
        clamp(vOutdoorGrassHighlight, 0.0, 1.0),
        mix(10.0, 2.0, uArtGrassRoughness)
      ) * (1.0 - uArtGrassRoughness) * 0.22;
      diffuseColor.rgb += vec3(artGrassSheen);
      `,
    )

    onShaderReady(shader)
  }
}

function GrassArtDirectionUpdater({ grassMaterial, shaderRef }) {
  const grassSurface = useArtDirectionValues().surfaces.grass
  useEffect(() => {
    const [r, g, b] = getArtDirectionColorMultiplier('grass', grassSurface.color)
    grassMaterial.color.setRGB(r, g, b)
    if (shaderRef.current?.uniforms.uArtGrassRoughness) {
      shaderRef.current.uniforms.uArtGrassRoughness.value = grassSurface.roughness
    }
  }, [grassMaterial, grassSurface.color, grassSurface.roughness, shaderRef])
  return null
}

// Changing quality remounts just the streamer so slot sizes and cached density
// cannot disagree. Ordinary parent renders keep every slot and mesh intact.
function TerrainGroundCover(props) {
  return <GrassStreamer key={props.reducedDensity ? 'reduced' : 'full'} {...props} />
}

function GrassStreamer({ playerPositionRef, ballRef, active = true, debugStats = false,
  biomeAreas = MAP_BIOME_AREAS, reducedDensity = false }) {
  const step = reducedDensity ? 0.3 : GRASS_GRID_STEP
  // Include the last grid point and floating-point rounding at chunk boundaries.
  const slotCapacity = (Math.ceil(GRASS_CHUNK_SIZE / step) + 1) ** 2
  const chunkCapacity = (GRASS_ACTIVE_CHUNK_RADIUS * 2 + 1) ** 2
  const maxInstances = slotCapacity * chunkCapacity
  const allKeys = useMemo(() => getAllGrassChunkKeys(), [])
  const meshes = useRef([null, null, null, null])
  const shaderRef = useRef(null)
  const biomeRef = useRef(getGrassBiomeShaderData(biomeAreas))
  const state = useRef(null)
  if (!state.current) state.current = {
    center: null, target: new Set(), queue: [], job: null,
    pools: Array.from({ length: 4 }, () => createChunkSlots(chunkCapacity)),
    cache: new Map(), elapsed: 0, lastDebug: 0,
  }
  const baseTexture = useTexture(GRASS_TEXTURE)
  const texture = useMemo(() => {
    const t = baseTexture.clone(); t.colorSpace = SRGBColorSpace; t.needsUpdate = true
    return t
  }, [baseTexture])
  const geometries = useMemo(() => {
    const base = createGrassCardGeometry()
    const result = QUADRANTS.map(({ minX, maxX, minZ, maxZ }) => {
      const geometry = base.clone()
      geometry.setAttribute('instanceSpawnTime', new InstancedBufferAttribute(new Float32Array(maxInstances), 1))
      geometry.boundingBox = new Box3(new Vector3(minX, -2, minZ), new Vector3(maxX, 5, maxZ))
      geometry.boundingSphere = new Sphere(new Vector3((minX + maxX) / 2, 1.5, (minZ + maxZ) / 2),
        Math.hypot(maxX - minX, maxZ - minZ) / 2 + 6)
      return geometry
    })
    base.dispose()
    return result
  }, [maxInstances])
  const material = useMemo(() => {
    const mat = new MeshBasicMaterial({ map: texture, alphaTest: 0.45, side: FrontSide,
      transparent: false, depthWrite: true, color: 0xffffff, vertexColors: true })
    mat.onBeforeCompile = buildGrassHandleBeforeCompile(shader => { shaderRef.current = shader }, () => biomeRef.current)
    mat.customProgramCacheKey = () => 'terrain-grass-single-stream-v8'
    return mat
  }, [texture])
  // Stable callbacks: never zero mesh.count merely because React rerenders.
  const meshRefs = useMemo(() => QUADRANTS.map((_, i) => mesh => {
    meshes.current[i] = mesh
    if (mesh) {
      mesh.count = 0
      mesh.boundingSphere = geometries[i].boundingSphere.clone()
    }
  }), [geometries])

  useEffect(() => {
    const data = getGrassBiomeShaderData(biomeAreas)
    biomeRef.current = data
    const shader = shaderRef.current
    if (shader) {
      shader.uniforms.uGraveyardAreas.value = data.areas
      shader.uniforms.uGraveyardGroundIntensities.value = data.groundIntensities
      shader.uniforms.uGraveyardAreaCount.value = data.count
    }
  }, [biomeAreas])
  useEffect(() => () => {
    geometries.forEach(g => g.dispose()); material.dispose(); texture.dispose()
  }, [geometries, material, texture])

  useFrame((frame) => {
    if (!active) return
    const pp = playerPositionRef?.current
    if (!pp || !meshes.current.every(Boolean)) return
    const current = state.current
    current.elapsed = frame.clock.elapsedTime
    const cx = getGrassChunkIndex(pp.x), cz = getGrassChunkIndex(pp.z)
    const center = getGrassChunkKey(cx, cz)
    if (center !== current.center) {
      current.center = center
      const keys = getActiveGrassChunkKeys(allKeys, cx, cz)
      const target = new Set(keys)
      current.target = target
      // Retiring chunks are beyond the visible radius (22 + jitter <= 26 m),
      // while the loaded ring reaches at least 30 m along each side.
      current.pools.forEach((pool, quadrant) => {
        const mesh = meshes.current[quadrant]
        for (const { key, slot } of pool.retireOutside(target)) {
          writeGrassSlot(mesh, slot, slotCapacity, [], -1000)
          current.cache.delete(key)
        }
        mesh.count = pool.slots.size ? (Math.max(...pool.slots.values()) + 1) * slotCapacity : 0
      })
      if (current.job && !target.has(current.job.key)) current.job = null
      current.queue = keys.filter(key => {
        const [x, z] = key.split(':').map(Number)
        return !current.pools[getChunkQuadrantIndex(x, z)].slots.has(key) && key !== current.job?.key
      })
    }

    const deadline = performance.now() + GRASS_CHUNK_BUILD_TIME_BUDGET_MS
    // Bounded generation and one chunk upload per frame. Existing visible slots
    // are untouched while replacements are prepared in the outer safety ring.
    if (!current.job && current.queue.length) current.job = createGrassChunkBuildJob(current.queue.shift(), step)
    if (current.job && continueGrassChunkBuild(current.job, deadline)) {
      const job = current.job
      const [x, z] = job.key.split(':').map(Number)
      const quadrant = getChunkQuadrantIndex(x, z)
      const pool = current.pools[quadrant]
      const slot = pool.claim(job.key)
      const mesh = meshes.current[quadrant]
      writeGrassSlot(mesh, slot, slotCapacity, job.grass, current.elapsed)
      mesh.count = Math.max(mesh.count, (slot + 1) * slotCapacity)
      current.cache.set(job.key, job.grass.length)
      current.job = null
    }

    const shader = shaderRef.current
    if (shader) {
      _cameraForward.set(0, 0, -1).applyQuaternion(frame.camera.quaternion)
      _cameraForward.y = 0
      if (_cameraForward.lengthSq() > 0.0001) _cameraForward.normalize()
      shader.uniforms.uTime.value = current.elapsed
      shader.uniforms.uPlayerPosition.value.set(pp.x, pp.y, pp.z)
      shader.uniforms.uCameraForward.value.copy(_cameraForward)
      const bp = ballRef?.current?.translation?.()
      if (bp) shader.uniforms.uBallPosition.value.set(bp.x, bp.y, bp.z)
      else shader.uniforms.uBallPosition.value.set(9999, 0, 9999)
    }
    if (debugStats && current.elapsed - current.lastDebug > 0.6) {
      current.lastDebug = current.elapsed
      window.__grassDebug = {
        system: 'single-local-stream', queuedChunks: current.queue.length,
        activeChunk: center, targetChunks: current.target.size,
        mountedChunks: current.cache.size,
        mountedBlades: [...current.cache.values()].reduce((a, b) => a + b, 0),
        submittedSlots: meshes.current.reduce((sum, mesh) => sum + mesh.count, 0),
        buildingChunk: current.job?.key ?? null,
      }
    }
  })

  return <group visible={active} userData={{ debugCategory: 'grass' }}>
    <GrassArtDirectionUpdater grassMaterial={material} shaderRef={shaderRef} />
    {QUADRANTS.map((quadrant, i) => <instancedMesh key={quadrant.id} ref={meshRefs[i]}
      args={[geometries[i], material, maxInstances]} frustumCulled userData={{ debugCategory: 'grass-mesh' }} />)}
  </group>
}

export default TerrainGroundCover
