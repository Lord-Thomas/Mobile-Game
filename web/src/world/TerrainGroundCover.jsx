import { useEffect, useMemo, useRef } from 'react'
import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Box3, BufferGeometry, Color, Float32BufferAttribute, FrontSide, DynamicDrawUsage, InstancedBufferAttribute, MathUtils, MeshBasicMaterial, Sphere, SRGBColorSpace, Vector3, Vector4 } from 'three'
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
import { addBouquetRows } from './grass/grassBouquets'
import { GRASS_LODS, grassGridAxis, grassSampleLevel, grassLevelCapacity } from './grass/grassLod'
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
const GRASS_CHUNK_BUILD_TIME_BUDGET_MS = 2
const GRASS_ACTIVE_CHUNK_RADIUS = 7
// Permanent coarse coverage is split into quadrants for frustum culling.
// Each streamed detail tier uses one shared buffer, avoiding 4x memory reservation.
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

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function makeGrassInstance(x, z, seed, level) {
  const h = getTerrainHeight(x, z)
  return {
    position: [x, h + 0.04, z],
    // Local terrain plane keeps bouquet rows grounded on slopes as the camera turns.
    groundSlope: level > 0 ? [getTerrainHeight(x + 0.5, z) - getTerrainHeight(x - 0.5, z),
      getTerrainHeight(x, z + 0.5) - getTerrainHeight(x, z - 0.5)] : [0, 0],
    rotation: [0, (seededRandom(seed + 18) - 0.5) * grassPlacementSettings.rotationRandomness * 2, 0],
    scale: grassPlacementSettings.minScale + seededRandom(seed + 9) * GRASS_SCALE_RANGE,
    colorShift: seededRandom(seed + 41),
  }
}

function pushGrassRow(grass, xi, zValues, row, level) {
  for (let column = 0; column < zValues.length; column++) {
    if (grassSampleLevel(row, column) !== level) continue
    const zi = zValues[column]
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
    if (seededRandom(seed + 19) < density) grass.push(makeGrassInstance(x, z, seed, level))
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
  const maxX = Math.min(GRASS_AREA_MAX, (chunkX + 1) * GRASS_CHUNK_SIZE)
  const minZ = Math.max(GRASS_AREA_MIN, chunkZ * GRASS_CHUNK_SIZE)
  const maxZ = Math.min(GRASS_AREA_MAX, (chunkZ + 1) * GRASS_CHUNK_SIZE)
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
  // Parse each key once, not repeatedly inside the sort comparator.
  return allKeys.map(key => ({ key, distance: getGrassChunkDistance(key, centerChunkX, centerChunkZ) }))
    .filter(chunk => chunk.distance <= radius)
    .sort((a, b) => a.distance - b.distance)
    .map(chunk => chunk.key)
}

function createGrassChunkBuildJob(key, step, level) {
  const [chunkX, chunkZ] = key.split(':').map(Number)
  const bounds = getGrassChunkBounds(chunkX, chunkZ)
  return { key, level, row: 0, grass: [],
    xs: grassGridAxis(bounds.minX, bounds.maxX, step),
    zs: grassGridAxis(bounds.minZ, bounds.maxZ, step) }
}

function continueGrassChunkBuild(job, deadline) {
  while (job.row < job.xs.length) {
    pushGrassRow(job.grass, job.xs[job.row], job.zs, job.row, job.level)
    job.row++
    if (performance.now() >= deadline) return false
  }
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
      uniform vec3 uPlayerPosition;
      uniform vec3 uBallPosition;
      uniform float uBallInteractionRadius;
      uniform vec3 uWindDirection;
      uniform vec3 uCameraForward;
      uniform vec4 uGraveyardAreas[${BIOME_SHADER_MAX_AREAS}];
      uniform float uGraveyardGroundIntensities[${BIOME_SHADER_MAX_AREAS}];
      uniform int uGraveyardAreaCount;
      attribute float instanceSpawnTime;
      attribute float instanceLod;
      attribute float grassRow;
      attribute vec2 instanceGroundSlope;
      varying float vGrassColumns;
      varying float vGrassBouquetSeed;
      varying float vGrassCoverage;
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
      // Fade individual pixels, not whole tiles or randomly culled whole blades.
      // The permanent coarse subset continues all the way to the terrain edge.
      float viewDistance = playerDistance;
      float fine = 1.0 - smoothstep(${GRASS_LODS[0].fadeStart.toFixed(1)}, ${GRASS_LODS[0].fadeEnd.toFixed(1)}, viewDistance);
      float middle = 1.0 - smoothstep(${GRASS_LODS[1].fadeStart.toFixed(1)}, ${GRASS_LODS[1].fadeEnd.toFixed(1)}, viewDistance);
      float coverage = instanceLod < 0.5 ? fine : (instanceLod < 1.5 ? middle : 1.0);
      // Expand the footprint by ADDING texture repetitions, never stretching a tuft.
      // Detail replaces 3x3 cells, coarse replaces 9x9 cells of the same grid.
      float localColumns = sqrt(9.0 - 8.0 * fine);
      float columns = instanceLod < 0.5 ? 1.0 : localColumns;
      if (instanceLod > 1.5) columns *= sqrt(9.0 - 8.0 * middle);
      vGrassColumns = columns;
      vGrassBouquetSeed = grassHash(grassOrigin.xz + grassRow * vec2(17.3, 9.1));
      // Stretch only the underlying surface: UV repetition keeps tuft width constant.
      transformed.x += localX * camRight.x * (columns - 1.0);
      transformed.z += localX * camRight.y * (columns - 1.0);
      float rowVisibility = clamp((columns - 1.0) * 0.5 - abs(grassRow) + 1.0, 0.0, 1.0);
      if (abs(grassRow) < 0.5) rowVisibility = 1.0;
      vec2 rowForward = vec2(-camRight.y, camRight.x);
      float rowStagger = (vGrassBouquetSeed - 0.5) * 0.7 * min(1.0, columns - 1.0);
      vec2 rowOffset = rowForward * grassRow * 0.92 + camRight * rowStagger;
      transformed.x += rowOffset.x;
      transformed.z += rowOffset.y;
      transformed.y += dot(rowOffset + camRight * localX * (columns - 1.0), instanceGroundSlope);
      float reveal = smoothstep(0.0, 0.8, uTime - instanceSpawnTime);
      vGrassCoverage = coverage * rowVisibility * reveal * (1.0 - graveyardGrassCull);
      // Skip rasterization for invisible cards, with no per-frame matrix uploads.
      if (vGrassCoverage < 0.001) transformed.y -= 10000.0;

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
      varying float vGrassColumns;
      varying float vGrassBouquetSeed;
      varying float vGrassCoverage;
      varying vec3 vOutdoorGrassLight;
      varying float vOutdoorGrassHighlight;
      `,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      #ifdef USE_MAP
        vec2 tuftUv = vMapUv;
        float edgeCoverage = 1.0;
        if (vGrassColumns > 1.001) {
          // Center-aligned repetitions: new tufts enter at the outside edges,
          // existing tufts never slide or widen during the transition.
          float tiledX = (vMapUv.x - 0.5) * vGrassColumns + 0.5;
          float cell = floor(tiledX);
          float variation = fract(sin(cell * 127.1 + vGrassBouquetSeed * 311.7) * 43758.5453);
          float tuftHeight = mix(0.84, 1.0, variation);
          // Preserve the original central tuft exactly until the bouquet develops.
          float bouquetMix = smoothstep(1.0, 2.0, vGrassColumns);
          tuftUv = vec2(fract(tiledX), vMapUv.y / mix(1.0, tuftHeight, bouquetMix));
          if (variation < 0.5 && bouquetMix > 0.0) tuftUv.x = 1.0 - tuftUv.x;
          edgeCoverage = 1.0 - smoothstep(0.94, 1.0, abs(vMapUv.x - 0.5) * 2.0);
          if (tuftUv.y > 1.0) discard;
        }
        // Explicit gradients avoid excessively blurry mip levels at UV repeat seams.
        vec2 grassDx = dFdx(vMapUv) * vec2(vGrassColumns, 1.0);
        vec2 grassDy = dFdy(vMapUv) * vec2(vGrassColumns, 1.0);
        vec4 sampledGrass = textureGrad(map, tuftUv, grassDx, grassDy);
        diffuseColor *= sampledGrass;
        diffuseColor.a *= edgeCoverage;
      #endif
      diffuseColor.rgb *= vOutdoorGrassLight;
      float artGrassSheen = pow(
        clamp(vOutdoorGrassHighlight, 0.0, 1.0),
        mix(10.0, 2.0, uArtGrassRoughness)
      ) * (1.0 - uArtGrassRoughness) * 0.22;
      diffuseColor.rgb += vec3(artGrassSheen);
      `,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <alphatest_fragment>',
      `#include <alphatest_fragment>
       // Screen-space ordered coverage keeps depth writes and avoids transparent sorting.
       float grassDither = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
       if (vGrassCoverage <= grassDither) discard;`,
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
  // Fixed memory budgets per tier; coarse coverage is never recycled on movement.
  const batches = useMemo(() => GRASS_LODS.flatMap((lod, level) => (level === 2 ? QUADRANTS : [{
    id: 'local', minX: -TERRAIN_HALF_SIZE, maxX: TERRAIN_HALF_SIZE,
    minZ: -TERRAIN_HALF_SIZE, maxZ: TERRAIN_HALF_SIZE,
  }]).map((quadrant, q) => ({
    ...quadrant, level, quadrant: q,
    slotCapacity: grassLevelCapacity(step, level),
    chunkCapacity: level === 2 ? (Math.ceil(TERRAIN_HALF_SIZE / GRASS_CHUNK_SIZE)) ** 2 : (lod.radius * 2 + 1) ** 2,
  }))), [step])
  const allKeys = useMemo(() => getAllGrassChunkKeys(), [])
  const meshes = useRef(Array(6).fill(null))
  const shaderRef = useRef(null)
  const biomeRef = useRef(getGrassBiomeShaderData(biomeAreas))
  const state = useRef(null)
  if (!state.current) state.current = {
    center: null, targets: [], queues: [[], [], []], jobs: [null, null, null], turn: 0,
    pools: batches.map(batch => createChunkSlots(batch.chunkCapacity)),
    cache: new Map(), elapsed: 0, lastDebug: 0,
  }
  const baseTexture = useTexture(GRASS_TEXTURE)
  const texture = useMemo(() => {
    const t = baseTexture.clone(); t.colorSpace = SRGBColorSpace; t.needsUpdate = true
    return t
  }, [baseTexture])
  const geometries = useMemo(() => {
    const base = createGrassCardGeometry()
    const result = batches.map(({ minX, maxX, minZ, maxZ, slotCapacity, chunkCapacity, level }) => {
      const maxInstances = slotCapacity * chunkCapacity
      const geometry = addBouquetRows(base.clone(), level, Float32BufferAttribute)
      geometry.setAttribute('instanceSpawnTime', new InstancedBufferAttribute(new Float32Array(maxInstances), 1).setUsage(DynamicDrawUsage))
      geometry.setAttribute('instanceGroundSlope', new InstancedBufferAttribute(new Float32Array(maxInstances * 2), 2).setUsage(DynamicDrawUsage))
      geometry.setAttribute('instanceLod', new InstancedBufferAttribute(new Float32Array(maxInstances).fill(level), 1))
      geometry.boundingBox = new Box3(new Vector3(minX, -2, minZ), new Vector3(maxX, 5, maxZ))
      geometry.boundingSphere = new Sphere(new Vector3((minX + maxX) / 2, 1.5, (minZ + maxZ) / 2),
        Math.hypot(maxX - minX, maxZ - minZ) / 2 + 6)
      return geometry
    })
    base.dispose()
    return result
  }, [batches])
  const material = useMemo(() => {
    const mat = new MeshBasicMaterial({ map: texture, alphaTest: 0.45, side: FrontSide,
      transparent: false, depthWrite: true, color: 0xffffff, vertexColors: true })
    mat.onBeforeCompile = buildGrassHandleBeforeCompile(shader => { shaderRef.current = shader }, () => biomeRef.current)
    mat.customProgramCacheKey = () => 'terrain-grass-bouquets-v10'
    return mat
  }, [texture])
  // Stable callbacks: never zero mesh.count merely because React rerenders.
  const meshRefs = useMemo(() => batches.map((_, i) => mesh => {
    meshes.current[i] = mesh
    if (mesh) {
      mesh.count = 0
      mesh.instanceMatrix.setUsage(DynamicDrawUsage)
      mesh.boundingSphere = geometries[i].boundingSphere.clone()
    }
  }), [geometries, batches])

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
      GRASS_LODS.forEach((lod, level) => {
        const keys = getActiveGrassChunkKeys(allKeys, cx, cz, lod.radius)
        const target = new Set(keys)
        current.targets[level] = target
        for (let q = 0; q < (level === 2 ? 4 : 1); q++) {
          const index = level === 2 ? 2 + q : level
          const pool = current.pools[index], mesh = meshes.current[index]
          for (const { key, slot } of pool.retireOutside(target)) {
            writeGrassSlot(mesh, slot, batches[index].slotCapacity, [], -1000)
            current.cache.delete(`${level}/${key}`)
          }
          mesh.count = pool.slots.size ? (Math.max(...pool.slots.values()) + 1) * batches[index].slotCapacity : 0
        }
        if (current.jobs[level] && !target.has(current.jobs[level].key)) current.jobs[level] = null
        current.queues[level] = keys.filter(key => {
          const [x, z] = key.split(':').map(Number)
          return !current.pools[level === 2 ? 2 + getChunkQuadrantIndex(x, z) : level].slots.has(key) && key !== current.jobs[level]?.key
        })
      })
    }

    const started = performance.now()
    const deadline = started + GRASS_CHUNK_BUILD_TIME_BUDGET_MS
    // Fair scheduling: distant coverage can never be starved by player movement.
    // Several cheap coarse tiles fit in a frame; expensive fine tiles resume next frame.
    let uploads = 0
    for (let attempt = 0; attempt < 24 && performance.now() < deadline && uploads < 8; attempt++) {
      const level = current.turn++ % 3
      if (!current.jobs[level] && current.queues[level].length) {
        current.jobs[level] = createGrassChunkBuildJob(current.queues[level].shift(), step, level)
      }
      const job = current.jobs[level]
      if (!job || !continueGrassChunkBuild(job, deadline)) continue
      const [x, z] = job.key.split(':').map(Number)
      const index = level === 2 ? 2 + getChunkQuadrantIndex(x, z) : level
      const slot = current.pools[index].claim(job.key)
      const mesh = meshes.current[index], capacity = batches[index].slotCapacity
      writeGrassSlot(mesh, slot, capacity, job.grass, current.elapsed)
      mesh.count = Math.max(mesh.count, (slot + 1) * capacity)
      current.cache.set(`${level}/${job.key}`, job.grass.length)
      current.jobs[level] = null
      uploads++
    }
    current.lastBuildMs = performance.now() - started

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
        system: 'unified-world-lod', queuedChunks: current.queues.map(q => q.length),
        generationMs: current.lastBuildMs,
        activeChunk: center, targetChunks: current.targets.map(t => t.size),
        mountedChunks: current.cache.size,
        mountedBlades: [...current.cache.values()].reduce((a, b) => a + b, 0),
        submittedSlots: meshes.current.reduce((sum, mesh) => sum + mesh.count, 0),
        buildingChunks: current.jobs.map(job => job?.key ?? null),
      }
    }
  })

  return <group visible={active} userData={{ debugCategory: 'grass' }}>
    <GrassArtDirectionUpdater grassMaterial={material} shaderRef={shaderRef} />
    {batches.map((batch, i) => <instancedMesh key={`${batch.level}/${batch.id}`} ref={meshRefs[i]}
      args={[geometries[i], material, batch.slotCapacity * batch.chunkCapacity]} frustumCulled userData={{ debugCategory: 'grass-mesh' }} />)}
  </group>
}

export default TerrainGroundCover
