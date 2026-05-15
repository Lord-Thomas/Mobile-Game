import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Box3, BufferGeometry, Color, Float32BufferAttribute, FrontSide, MathUtils, MeshBasicMaterial, Object3D, Sphere, SRGBColorSpace, Vector3 } from 'three'
import { getTerrainHeight, TERRAIN_HALF_SIZE } from './terrain/terrainGeometry'
import { canPlaceObject, getDistanceToPath, getDistanceToRoad, getZoneDensity, isInsideHouseFootprint } from './worldZones'
import { ROAD_WIDTH } from './outdoorData'

const dummy = new Object3D()
const _cameraForward = new Vector3()
const grassPlacementSettings = {
  rotationRandomness: Math.PI,
  positionJitter: 0.45,
  minScale: 0.18,
  maxScale: 0.3,
}
const GRASS_AREA_MIN = -TERRAIN_HALF_SIZE
const GRASS_AREA_MAX = TERRAIN_HALF_SIZE
const GRASS_GRID_STEP_NEAR = 0.13
const GRASS_GRID_STEP_FAR = 0.28
const GRASS_NEAR_DIST = 24
const GRASS_FAR_DIST = 48
const GRASS_DENSITY_MULTIPLIER = 9.5
const GRASS_CHUNK_SIZE = 6
const GRASS_CHUNK_ROWS_PER_IDLE_BATCH = 96
const GRASS_CHUNK_MIN_ROWS_PER_BATCH = 20
const GRASS_CHUNK_BUILD_TIME_BUDGET_MS = 8
const GRASS_BOOTSTRAP_CHUNK_COUNT = 9999
// Terrain split into 4 quadrants — each gets its own instancedMesh so Three.js
// frustum-culls entire quadrants when they fall outside the camera view.
const QUADRANTS = [
  { id: 'ne', minX: 0,               maxX: TERRAIN_HALF_SIZE,  minZ: 0,               maxZ: TERRAIN_HALF_SIZE },
  { id: 'nw', minX: -TERRAIN_HALF_SIZE, maxX: 0,               minZ: 0,               maxZ: TERRAIN_HALF_SIZE },
  { id: 'se', minX: 0,               maxX: TERRAIN_HALF_SIZE,  minZ: -TERRAIN_HALF_SIZE, maxZ: 0 },
  { id: 'sw', minX: -TERRAIN_HALF_SIZE, maxX: 0,               minZ: -TERRAIN_HALF_SIZE, maxZ: 0 },
]
const MAX_QUADRANT_INSTANCES = 350_000
const DISTANT_GRASS_AREA_MIN = -TERRAIN_HALF_SIZE
const DISTANT_GRASS_AREA_MAX = TERRAIN_HALF_SIZE
const DISTANT_GRASS_GRID_STEP = 0.72
const DISTANT_GRASS_ROWS_PER_IDLE_BATCH = 10
const GRASS_TEXTURE = '/textures/outdoor/grass-001-white.png'
const grassBottomColor = new Color('#638b0f')
const grassMiddleColor = new Color('#6f970e')
const grassTopColor = new Color('#8aac22')
const GRASS_CARD_HEIGHT = 0.78
const GRASS_VERTICAL_SEGMENTS = 1
const GRASS_FULL_DENSITY_RADIUS = 10
const GRASS_THINNING_RADIUS = 52
const GRASS_MIN_KEEP_PROBABILITY = 0.05
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

function getTerrainSlope(x, z) {
  const step = 0.25
  const h = getTerrainHeight(x, z)
  const dx = (getTerrainHeight(x + step, z) - h) / step
  const dz = (getTerrainHeight(x, z + step) - h) / step
  return Math.sqrt(dx * dx + dz * dz)
}

function makeRockInstance(x, z, seed) {
  return {
    position: [x, getTerrainHeight(x, z) + 0.03, z],
    rotation: [0, seededRandom(seed + 18) * Math.PI * 2, 0],
    scale: 0.75 + seededRandom(seed + 9) * 0.65,
    colorShift: seededRandom(seed + 41),
  }
}

function makeDistantGrassInstance(x, z, seed) {
  return {
    position: [x, getTerrainHeight(x, z) + 0.035, z],
    rotation: [0, (seededRandom(seed + 18) - 0.5) * Math.PI * 2, 0],
    scale: 0.16 + seededRandom(seed + 9) * 0.11,
    colorShift: seededRandom(seed + 41),
  }
}

function makeGrassInstance(x, z, seed) {
  const scaleRange = grassPlacementSettings.maxScale - grassPlacementSettings.minScale
  const slope = getTerrainSlope(x, z)
  // Lift blades on slopes so they don't embed into the terrain face
  const slopeLift = slope * 0.5
  return {
    position: [x, getTerrainHeight(x, z) + 0.032 + slopeLift, z],
    rotation: [0, (seededRandom(seed + 18) - 0.5) * grassPlacementSettings.rotationRandomness * 2, 0],
    scale: grassPlacementSettings.minScale + seededRandom(seed + 9) * scaleRange,
    colorShift: seededRandom(seed + 41),
  }
}

function getDistantGrassDensity(x, z, seed) {
  const maxAxis = Math.max(Math.abs(x), Math.abs(z))
  if (maxAxis > TERRAIN_HALF_SIZE) return 0

  const farFade = 1 - smoothstep(TERRAIN_HALF_SIZE - 12, TERRAIN_HALF_SIZE, maxAxis)
  const clumpNoise = seededRandom(Math.floor(x * 0.19) * 131 + Math.floor(z * 0.19) * 197)
  const clumpVariation = 0.78 + smoothstep(0.18, 0.82, clumpNoise) * 0.22
  const slope = getTerrainSlope(x, z)
  const slopeFade = 1 - smoothstep(0.24, 0.58, slope)
  const mountainFade = 1 - smoothstep(62, 90, maxAxis) * 0.35
  const visualDensity = getVisualGrassDensity(x, z)

  return Math.max(
    0.08,
    visualDensity * 1.2,
  ) * farFade * clumpVariation * slopeFade * mountainFade * (0.82 + seededRandom(seed + 71) * 0.18)
}

function pushGrassRow(grass, xi, minZ, maxZ, step = GRASS_GRID_STEP_NEAR) {
  for (let zi = minZ; zi <= maxZ; zi += step) {
    const seed = (xi + 61) * 197 + (zi + 43) * 137
    const x = xi + (seededRandom(seed) - 0.5) * grassPlacementSettings.positionJitter * 2
    const z = zi + (seededRandom(seed + 5) - 0.5) * grassPlacementSettings.positionJitter * 2
    const gameplayDensity = Math.max(getZoneDensity('tall_grass', x, z), getZoneDensity('lawn_blade', x, z) * 0.9)
    const visualDensity = getVisualGrassDensity(x, z)
    const density = Math.min(1, Math.max(gameplayDensity, visualDensity) * GRASS_DENSITY_MULTIPLIER)
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

function getGrassChunkStep(chunkX, chunkZ) {
  const centerX = (chunkX + 0.5) * GRASS_CHUNK_SIZE
  const centerZ = (chunkZ + 0.5) * GRASS_CHUNK_SIZE
  const dist = Math.max(Math.abs(centerX), Math.abs(centerZ))
  const t = Math.min(1, Math.max(0, (dist - GRASS_NEAR_DIST) / (GRASS_FAR_DIST - GRASS_NEAR_DIST)))
  return GRASS_GRID_STEP_NEAR + (GRASS_GRID_STEP_FAR - GRASS_GRID_STEP_NEAR) * t * t
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

function pushDistantGrassRow(grass, xi) {
  for (let zi = DISTANT_GRASS_AREA_MIN; zi <= DISTANT_GRASS_AREA_MAX; zi += DISTANT_GRASS_GRID_STEP) {
    const seed = (xi + 119) * 89 + (zi + 97) * 149
    const x = xi + (seededRandom(seed) - 0.5) * 1.35
    const z = zi + (seededRandom(seed + 5) - 0.5) * 1.35
    if (seededRandom(seed + 19) < getDistantGrassDensity(x, z, seed)) {
      grass.push(makeDistantGrassInstance(x, z, seed))
    }
  }
}

function createRockCover() {
  const rocks = []

  for (let xi = -36; xi <= 36; xi += 2) {
    for (let zi = -36; zi <= 36; zi += 2) {
      const seed = (xi + 48) * 173 + (zi + 52) * 97
      const x = xi + (seededRandom(seed) - 0.5) * 1.75
      const z = zi + (seededRandom(seed + 5) - 0.5) * 1.75
      if (!canPlaceObject('rock', x, z)) continue

      if (seededRandom(seed + 57) < getZoneDensity('rock', x, z)) {
        rocks.push(makeRockInstance(x - 0.25, z + 0.25, seed + 6))
      }
    }
  }

  return rocks
}

function buildGrassHandleBeforeCompile(shaderRef) {
  return (shader) => {
    shader.uniforms.uTime = { value: 0 }
    shader.uniforms.uPlayerPosition = { value: new Vector3(9999, 0, 9999) }
    shader.uniforms.uBladeHeight = { value: GRASS_CARD_HEIGHT }
    shader.uniforms.uWindStrength = { value: grassWindSettings.strength }
    shader.uniforms.uWindSpeed = { value: grassWindSettings.speed }
    shader.uniforms.uWindScale = { value: grassWindSettings.scale }
    shader.uniforms.uInteractionRadius = { value: grassInteractionSettings.radius }
    shader.uniforms.uInteractionStrength = { value: grassInteractionSettings.strength }
    shader.uniforms.uFullDensityRadius = { value: GRASS_FULL_DENSITY_RADIUS }
    shader.uniforms.uThinningRadius = { value: GRASS_THINNING_RADIUS }
    shader.uniforms.uMinKeepProbability = { value: GRASS_MIN_KEEP_PROBABILITY }
    shader.uniforms.uWindDirection = {
      value: new Vector3(grassWindSettings.directionX, 0, grassWindSettings.directionZ).normalize(),
    }
    shader.uniforms.uCameraForward = { value: new Vector3(0, 0, -1) }
    shader.uniforms.uCameraAngleMinDensity = { value: 0.3 }

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
      uniform vec3 uPlayerPosition;
      uniform vec3 uWindDirection;
      uniform vec3 uCameraForward;
      uniform float uCameraAngleMinDensity;

      float grassHash(vec2 value) {
        return fract(sin(dot(value, vec2(12.9898, 78.233))) * 43758.5453123);
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

      // Camera-angle density: blades behind the camera are progressively thinned.
      // Only kicks in for distant grass (smooth fade 8→20 units), so nearby grass is unaffected.
      float cameraDistFade = smoothstep(8.0, 20.0, playerDistance);
      vec2 toGrassNorm = fromPlayer / max(playerDistance, 0.0001);
      float cameraDot = dot(toGrassNorm, uCameraForward.xz);
      float cameraAngleFactor = smoothstep(-0.8, 0.2, cameraDot);
      keepProbability *= mix(1.0, mix(uCameraAngleMinDensity, 1.0, cameraAngleFactor), cameraDistFade);

      float keep = step(grassHash(grassOrigin.xz), keepProbability);
      transformed.y -= (1.0 - keep) * 1000.0;
      float playerInfluence = smoothstep(uInteractionRadius, 0.0, playerDistance) * heightFactor;

      if (playerDistance > 0.0001) {
        vec2 pushDirection = normalize(fromPlayer);
        transformed.x += pushDirection.x * uInteractionStrength * playerInfluence;
        transformed.z += pushDirection.y * uInteractionStrength * playerInfluence;
        transformed.y -= uInteractionStrength * 0.06 * playerInfluence;
      }
      `,
    )

    // eslint-disable-next-line no-param-reassign
    shaderRef.current = shader
  }
}

function TerrainGroundCover({ playerPositionRef, active = true }) {
  const rocks = useMemo(() => createRockCover(), [])
  const allGrassChunkKeys = useMemo(() => getAllGrassChunkKeys(), [])
  const [grassChunks, setGrassChunks] = useState({})
  const [distantGrass, setDistantGrass] = useState(null)
  const ref = useRef()
  const activeGrassCenterRef = useRef(null)
  const grassChunkCacheRef = useRef(new Map())
  const pendingGrassChunksRef = useRef(new Set())
  const grassChunkQueueRef = useRef([])
  const grassChunkTimerRef = useRef(null)
  const activeGrassChunkJobRef = useRef(null)
  const residentGrassKeysRef = useRef(new Set())

  // 4 quadrant instancedMeshes — each has a correct bounding box so Three.js can
  // frustum-cull entire quadrants that fall outside the camera view (4 draw calls).
  const grassMeshRefs = useRef([null, null, null, null])
  const shaderRef = useRef(null)
  const writtenChunkKeysRefs = useRef([new Set(), new Set(), new Set(), new Set()])
  const writtenDistantGrassRef = useRef(false)
  const nextGrassOffsetRefs = useRef([0, 0, 0, 0])

  const baseTexture = useTexture(GRASS_TEXTURE)
  const grassTexture = useMemo(() => {
    const t = baseTexture.clone()
    t.colorSpace = SRGBColorSpace
    t.needsUpdate = true
    return t
  }, [baseTexture])
  useEffect(() => () => grassTexture.dispose(), [grassTexture])

  const grassBaseGeometry = useMemo(() => createGrassCardGeometry(), [])

  // One geometry clone per quadrant — each carries its own bounding sphere so
  // Three.js frustum-culls correctly (the blade geometry alone is too small to cull by).
  const grassGeometries = useMemo(() => QUADRANTS.map(({ minX, maxX, minZ, maxZ }) => {
    const geo = grassBaseGeometry.clone()
    const cx = (minX + maxX) / 2
    const cz = (minZ + maxZ) / 2
    const radius = Math.hypot(maxX - minX, maxZ - minZ) / 2 + 6
    geo.boundingBox = new Box3(new Vector3(minX, -2, minZ), new Vector3(maxX, 5, maxZ))
    geo.boundingSphere = new Sphere(new Vector3(cx, 1.5, cz), radius)
    return geo
  }), [grassBaseGeometry])

  // One shared material for all 4 quadrants — single shader compilation, single uniform set.
  const grassMaterial = useMemo(() => {
    const mat = new MeshBasicMaterial({
      map: grassTexture,
      alphaTest: 0.45,
      side: FrontSide,
      transparent: false,
      depthWrite: true,
      color: 0xffffff,
      vertexColors: true,
    })
    mat.onBeforeCompile = buildGrassHandleBeforeCompile(shaderRef)
    return mat
  }, [grassTexture])
  useEffect(() => () => grassMaterial.dispose(), [grassMaterial])

  const publishGrassDebugStats = () => {
    if (typeof window === 'undefined') return
    const completedChunks = grassChunkCacheRef.current.size
    const mountedChunks = Object.keys(grassChunks).length
    let completedBlades = 0
    grassChunkCacheRef.current.forEach((items) => {
      completedBlades += items.length
    })
    window.__grassDebug = {
      queuedChunks: grassChunkQueueRef.current.length,
      pendingChunks: pendingGrassChunksRef.current.size,
      activeChunk: activeGrassChunkJobRef.current?.key ?? null,
      completedChunks,
      mountedChunks,
      completedBlades,
    }
  }

  const scheduleGrassChunkBuild = () => {
    if (grassChunkTimerRef.current !== null || grassChunkQueueRef.current.length === 0) return

    const run = (deadline) => {
      grassChunkTimerRef.current = null
      let rows = 0
      const startedAt = typeof performance !== 'undefined' ? performance.now() : 0

      while (
        rows < GRASS_CHUNK_ROWS_PER_IDLE_BATCH
        && (
          rows < GRASS_CHUNK_MIN_ROWS_PER_BATCH
          || !deadline
          || deadline.didTimeout
          || deadline.timeRemaining() > 2
        )
        && (
          typeof performance === 'undefined'
          || rows < GRASS_CHUNK_MIN_ROWS_PER_BATCH
          || performance.now() - startedAt < GRASS_CHUNK_BUILD_TIME_BUDGET_MS
        )
      ) {
        if (!activeGrassChunkJobRef.current) {
          const nextKey = grassChunkQueueRef.current.shift()
          if (!nextKey) break
          const [chunkX, chunkZ] = nextKey.split(':').map(Number)
          const bounds = getGrassChunkBounds(chunkX, chunkZ)
          activeGrassChunkJobRef.current = {
            key: nextKey,
            grass: [],
            xi: bounds.minX,
            step: getGrassChunkStep(chunkX, chunkZ),
            ...bounds,
          }
        }

        const job = activeGrassChunkJobRef.current
        pushGrassRow(job.grass, job.xi, job.minZ, job.maxZ, job.step)
        job.xi += job.step
        rows += 1

        if (job.xi > job.maxX) {
          grassChunkCacheRef.current.set(job.key, job.grass)
          pendingGrassChunksRef.current.delete(job.key)
          activeGrassChunkJobRef.current = null

          setGrassChunks((current) => (
            current[job.key]
              ? current
              : residentGrassKeysRef.current.has(job.key)
                ? { ...current, [job.key]: job.grass }
                : current
          ))
        }
      }

      publishGrassDebugStats()
      scheduleGrassChunkBuild()
    }

    const shouldBootstrap = grassChunkCacheRef.current.size < GRASS_BOOTSTRAP_CHUNK_COUNT

    if (!shouldBootstrap && typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      grassChunkTimerRef.current = window.requestIdleCallback(run, { timeout: 16 })
      return
    }

    grassChunkTimerRef.current = window.setTimeout(() => run(), 0)
  }

  useEffect(() => {
    activeGrassCenterRef.current = null

    if (active) {
      residentGrassKeysRef.current = new Set(allGrassChunkKeys)

      setGrassChunks((current) => {
        let changed = false
        const next = { ...current }
        allGrassChunkKeys.forEach((key) => {
          if (!next[key]) {
            const cached = grassChunkCacheRef.current.get(key)
            if (cached) {
              next[key] = cached
              changed = true
            }
          }
        })
        return changed ? next : current
      })

      publishGrassDebugStats()
      return
    }

    residentGrassKeysRef.current = new Set()
    grassChunkQueueRef.current = []
    pendingGrassChunksRef.current.clear()
    activeGrassChunkJobRef.current = null

    if (grassChunkTimerRef.current !== null && typeof window !== 'undefined') {
      if ('cancelIdleCallback' in window) window.cancelIdleCallback(grassChunkTimerRef.current)
      window.clearTimeout(grassChunkTimerRef.current)
      grassChunkTimerRef.current = null
    }

    publishGrassDebugStats()
  }, [active, allGrassChunkKeys])

  useFrame(() => {
    if (!active) return

    const playerPosition = playerPositionRef?.current
    if (!playerPosition) return

    const centerChunkX = getGrassChunkIndex(playerPosition.x)
    const centerChunkZ = getGrassChunkIndex(playerPosition.z)
    const nextCenterKey = getGrassChunkKey(centerChunkX, centerChunkZ)
    if (activeGrassCenterRef.current === nextCenterKey) return
    activeGrassCenterRef.current = nextCenterKey
    residentGrassKeysRef.current = new Set(allGrassChunkKeys)

    setGrassChunks((current) => {
      const next = { ...current }

      allGrassChunkKeys.forEach((key) => {
        const cached = grassChunkCacheRef.current.get(key)
        if (cached) next[key] = cached
      })

      return next
    })

    allGrassChunkKeys.forEach((key) => {
      if (grassChunkCacheRef.current.has(key) || pendingGrassChunksRef.current.has(key)) return
      pendingGrassChunksRef.current.add(key)
      grassChunkQueueRef.current.push(key)
    })

    grassChunkQueueRef.current.sort((leftKey, rightKey) => (
      getGrassChunkDistance(leftKey, centerChunkX, centerChunkZ)
      - getGrassChunkDistance(rightKey, centerChunkX, centerChunkZ)
    ))

    publishGrassDebugStats()
    scheduleGrassChunkBuild()
  })

  useEffect(() => {
    publishGrassDebugStats()
  }, [grassChunks])

  // Single useFrame for all grass uniforms (replaces one-per-chunk pattern)
  useFrame((state) => {
    const shader = shaderRef.current
    if (!shader) return
    // eslint-disable-next-line react-hooks/immutability
    shader.uniforms.uTime.value = state.clock.elapsedTime
    const pp = playerPositionRef?.current
    if (pp) shader.uniforms.uPlayerPosition.value.set(pp.x, pp.y, pp.z)
    _cameraForward.set(0, 0, -1).applyQuaternion(state.camera.quaternion)
    _cameraForward.y = 0
    if (_cameraForward.lengthSq() > 0.0001) _cameraForward.normalize()
    shader.uniforms.uCameraForward.value.copy(_cameraForward)
  })

  // Write newly built chunks into the correct quadrant buffer (incremental — only new chunks).
  useLayoutEffect(() => {
    const meshes = grassMeshRefs.current
    let dirtyQuadrants = 0
    Object.entries(grassChunks).forEach(([key, items]) => {
      const [cx, cz] = key.split(':').map(Number)
      const qi = getChunkQuadrantIndex(cx, cz)
      if (writtenChunkKeysRefs.current[qi].has(key)) return
      const mesh = meshes[qi]
      if (!mesh) return
      items.forEach((grass) => {
        if (nextGrassOffsetRefs.current[qi] >= MAX_QUADRANT_INSTANCES) return
        dummy.position.set(...grass.position)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.setScalar(grass.scale)
        dummy.updateMatrix()
        dummy.matrix.toArray(mesh.instanceMatrix.array, nextGrassOffsetRefs.current[qi] * 16)
        nextGrassOffsetRefs.current[qi] += 1
      })
      writtenChunkKeysRefs.current[qi].add(key)
      dirtyQuadrants |= 1 << qi
    })
    if (dirtyQuadrants) {
      meshes.forEach((mesh, qi) => {
        if (!(dirtyQuadrants & (1 << qi)) || !mesh) return
        mesh.count = nextGrassOffsetRefs.current[qi]
        mesh.instanceMatrix.needsUpdate = true
      })
    }
  }, [grassChunks])

  // Write distant grass into the correct quadrant buffers (once)
  useLayoutEffect(() => {
    const meshes = grassMeshRefs.current
    if (!distantGrass || writtenDistantGrassRef.current) return
    distantGrass.forEach((grass) => {
      const [x, , z] = grass.position
      const qi = (x >= 0 ? 0 : 1) + (z >= 0 ? 0 : 2)
      const mesh = meshes[qi]
      if (!mesh || nextGrassOffsetRefs.current[qi] >= MAX_QUADRANT_INSTANCES) return
      dummy.position.set(...grass.position)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(grass.scale)
      dummy.updateMatrix()
      dummy.matrix.toArray(mesh.instanceMatrix.array, nextGrassOffsetRefs.current[qi] * 16)
      nextGrassOffsetRefs.current[qi] += 1
    })
    writtenDistantGrassRef.current = true
    meshes.forEach((mesh, qi) => {
      if (!mesh) return
      mesh.count = nextGrassOffsetRefs.current[qi]
      mesh.instanceMatrix.needsUpdate = true
    })
  }, [distantGrass])

  useEffect(() => () => {
    if (grassChunkTimerRef.current === null || typeof window === 'undefined') return
    if ('cancelIdleCallback' in window) window.cancelIdleCallback(grassChunkTimerRef.current)
    window.clearTimeout(grassChunkTimerRef.current)
  }, [])

  useEffect(() => {
    if (distantGrass) return undefined

    let cancelled = false
    const nextGrass = []
    let xi = DISTANT_GRASS_AREA_MIN
    let timeoutId = null
    let idleId = null

    const schedule = (callback) => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(callback, { timeout: 90 })
        return
      }
      timeoutId = window.setTimeout(() => callback(), 0)
    }

    const runBatch = (deadline) => {
      let rows = 0

      while (
        xi <= DISTANT_GRASS_AREA_MAX
        && rows < DISTANT_GRASS_ROWS_PER_IDLE_BATCH
        && (!deadline || deadline.didTimeout || deadline.timeRemaining() > 2 || rows === 0)
      ) {
        pushDistantGrassRow(nextGrass, xi)
        xi += DISTANT_GRASS_GRID_STEP
        rows += 1
      }

      if (cancelled) return

      if (xi <= DISTANT_GRASS_AREA_MAX) {
        schedule(runBatch)
      } else {
        setDistantGrass(nextGrass)
      }
    }

    schedule(runBatch)

    return () => {
      cancelled = true
      if (timeoutId !== null) window.clearTimeout(timeoutId)
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
    }
  }, [distantGrass])

  useLayoutEffect(() => {
    rocks.forEach((rock, index) => {
      dummy.position.set(...rock.position)
      dummy.rotation.set(...rock.rotation)
      dummy.scale.setScalar(0.42 * rock.scale)
      dummy.updateMatrix()
      ref.current.setMatrixAt(index, dummy.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [rocks])

  return (
    <group visible={active} userData={{ debugCategory: 'grass' }}>
      {QUADRANTS.map((quadrant, qi) => (
        <instancedMesh
          key={quadrant.id}
          ref={(el) => { grassMeshRefs.current[qi] = el }}
          args={[grassGeometries[qi], grassMaterial, MAX_QUADRANT_INSTANCES]}
          frustumCulled
          userData={{ debugCategory: 'grass-mesh' }}
        />
      ))}
      <instancedMesh
        ref={ref}
        args={[undefined, undefined, rocks.length]}
        frustumCulled
        userData={{ debugCategory: 'rocks' }}
      >
        <dodecahedronGeometry args={[0.48, 0]} />
        <meshBasicMaterial color="#9d9688" />
      </instancedMesh>
    </group>
  )
}

export default TerrainGroundCover
