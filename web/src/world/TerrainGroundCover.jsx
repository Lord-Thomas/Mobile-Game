import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Box3, BufferGeometry, Color, Float32BufferAttribute, FrontSide, Frustum, MathUtils, Matrix4, MeshBasicMaterial, Object3D, Sphere, SRGBColorSpace, Vector3 } from 'three'
import { getTerrainHeight, TERRAIN_HALF_SIZE } from './terrain/terrainGeometry'
import { canPlaceObject, getDistanceToPath, getDistanceToRoad, getZoneDensity, isInsideHouseFootprint } from './worldZones'
import { ROAD_WIDTH } from './outdoorData'

const dummy = new Object3D()
const _cameraForward = new Vector3()
const _grassDebugFrustum = new Frustum()
const _grassDebugProjectionMatrix = new Matrix4()
const _grassDebugPoint = new Vector3()
const grassPlacementSettings = {
  rotationRandomness: Math.PI,
  positionJitter: 0.45,
  minScale: 0.18,
  maxScale: 0.3,
}
const GRASS_SCALE_RANGE = grassPlacementSettings.maxScale - grassPlacementSettings.minScale
const GRASS_AREA_MIN = -TERRAIN_HALF_SIZE
const GRASS_AREA_MAX = TERRAIN_HALF_SIZE
const GRASS_GRID_STEP = 0.15
const GRASS_DENSITY_MULTIPLIER = 9.5
const GRASS_CHUNK_SIZE = 6
const GRASS_CHUNK_BUILD_TIME_BUDGET_MS = 2.5
const GRASS_ACTIVE_CHUNK_RADIUS = 6
const GRASS_IMMEDIATE_BOOTSTRAP_RADIUS = 2
// Terrain split into 4 quadrants — each gets its own instancedMesh so Three.js
// frustum-culls entire quadrants when they fall outside the camera view.
const QUADRANTS = [
  { id: 'ne', minX: 0,               maxX: TERRAIN_HALF_SIZE,  minZ: 0,               maxZ: TERRAIN_HALF_SIZE },
  { id: 'nw', minX: -TERRAIN_HALF_SIZE, maxX: 0,               minZ: 0,               maxZ: TERRAIN_HALF_SIZE },
  { id: 'se', minX: 0,               maxX: TERRAIN_HALF_SIZE,  minZ: -TERRAIN_HALF_SIZE, maxZ: 0 },
  { id: 'sw', minX: -TERRAIN_HALF_SIZE, maxX: 0,               minZ: -TERRAIN_HALF_SIZE, maxZ: 0 },
]
const MAX_QUADRANT_INSTANCES = 350_000
const GRASS_GPU_CHUNK_WRITES_PER_FRAME = 8
const GRASS_BUFFER_COMPACTION_RATIO = 1.75
const GRASS_DEBUG_ESTIMATE_INTERVAL_MS = 600
const GRASS_DEBUG_MAX_SAMPLES = 60_000
const GRASS_TEXTURE = '/textures/outdoor/grass-001-white.png'
const grassBottomColor = new Color('#638b0f')
const grassMiddleColor = new Color('#6f970e')
const grassTopColor = new Color('#8aac22')
const GRASS_CARD_HEIGHT = 0.78
const GRASS_VERTICAL_SEGMENTS = 1
const GRASS_FULL_DENSITY_RADIUS = 10
const GRASS_THINNING_RADIUS = 52
const GRASS_MIN_KEEP_PROBABILITY = 0.035
const GRASS_CULL_FADE_START = 44
const GRASS_CULL_RADIUS = 52
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

function getTerrainSlope(x, z, baseHeight) {
  const step = 0.25
  const h = baseHeight !== undefined ? baseHeight : getTerrainHeight(x, z)
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

function makeGrassInstance(x, z, seed) {
  const h = getTerrainHeight(x, z)
  const slope = getTerrainSlope(x, z, h)
  const slopeLift = slope * 0.5
  return {
    position: [x, h + 0.032 + slopeLift, z],
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

function getActiveGrassChunkKeys(allKeys, centerChunkX, centerChunkZ) {
  return allKeys
    .filter((key) => getGrassChunkDistance(key, centerChunkX, centerChunkZ) <= GRASS_ACTIVE_CHUNK_RADIUS)
    .sort((a, b) => getGrassChunkDistance(a, centerChunkX, centerChunkZ) - getGrassChunkDistance(b, centerChunkX, centerChunkZ))
}

function buildGrassChunk(key) {
  const [chunkX, chunkZ] = key.split(':').map(Number)
  const bounds = getGrassChunkBounds(chunkX, chunkZ)
  const grass = []
  const step = GRASS_GRID_STEP
  for (let xi = bounds.minX; xi <= bounds.maxX; xi += step) {
    pushGrassRow(grass, xi, bounds.minZ, bounds.maxZ, step)
  }
  return grass
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

function buildGrassHandleBeforeCompile(onShaderReady) {
  return (shader) => {
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
      keepProbability *= 1.0 - smoothstep(uCullFadeStart, uCullRadius, playerDistance);

      // Distant blades represent small clusters: fewer instances, slightly wider cards.
      // The curve stays gradual so there is no visible LOD transition.
      float clusterT = thinningT * thinningT;
      transformed.x *= mix(1.0, uFarWidthScale, clusterT);
      transformed.y *= mix(1.0, uFarHeightScale, clusterT);

      float keep = step(grassHash(grassOrigin.xz), keepProbability);
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

    onShaderReady(shader)
  }
}

function TerrainGroundCover({ playerPositionRef, ballRef, active = true, debugStats = false }) {
  const rocks = useMemo(() => createRockCover(), [])
  const allGrassChunkKeys = useMemo(() => getAllGrassChunkKeys(), [])
  const ref = useRef()
  const activeGrassCenterRef = useRef(null)
  const activeGrassTargetKeysRef = useRef(new Set())
  const grassChunkCacheRef = useRef(new Map())
  const pendingGrassChunksRef = useRef(new Set())
  const grassChunkQueueRef = useRef([])
  // Chunks built but not yet written to GPU — writes happen only in useFrame where
  // mesh refs are guaranteed populated (not in useLayoutEffect where they may be null).
  const pendingGPUWriteRef = useRef([])

  // 4 quadrant instancedMeshes — each has a correct bounding box so Three.js can
  // frustum-cull entire quadrants that fall outside the camera view (4 draw calls).
  const grassMeshRefs = useRef([null, null, null, null])
  // Quadrant bounding spheres stored so we can re-apply them after each GPU write.
  // Three.js r175+ uses mesh.boundingSphere in priority over geometry.boundingSphere,
  // and may auto-recompute it from newly added instances only → wrong frustum culling.
  const shaderRef = useRef(null)
  const writtenChunkKeysRefs = useRef([new Set(), new Set(), new Set(), new Set()])
  const nextGrassOffsetRefs = useRef([0, 0, 0, 0])
  const lastGrassDebugEstimateAtRef = useRef(0)
  const grassVisibilityEstimateRef = useRef(null)
  const grassBuildTimingRef = useRef({
    samples: 0,
    totalMs: 0,
    maxMs: 0,
    lastMs: 0,
  })

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
  const grassGeometryData = useMemo(() => {
    const geometries = QUADRANTS.map(({ minX, maxX, minZ, maxZ }) => {
      const geo = grassBaseGeometry.clone()
      const cx = (minX + maxX) / 2
      const cz = (minZ + maxZ) / 2
      const radius = Math.hypot(maxX - minX, maxZ - minZ) / 2 + 6
      geo.boundingBox = new Box3(new Vector3(minX, -2, minZ), new Vector3(maxX, 5, maxZ))
      geo.boundingSphere = new Sphere(new Vector3(cx, 1.5, cz), radius)
      return geo
    })
    const spheres = geometries.map((geo) => geo.boundingSphere.clone())
    return { geometries, spheres }
  }, [grassBaseGeometry])
  const grassGeometries = grassGeometryData.geometries
  const grassQuadrantSpheres = grassGeometryData.spheres

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
    // eslint-disable-next-line react-hooks/refs
    mat.onBeforeCompile = buildGrassHandleBeforeCompile((shader) => {
      shaderRef.current = shader
    })
    return mat
  }, [grassTexture])
  useEffect(() => () => grassMaterial.dispose(), [grassMaterial])

  // Initialize mesh counts to 0 on mount to avoid showing uninitialized instances
  useLayoutEffect(() => {
    grassMeshRefs.current.forEach((mesh) => { if (mesh) mesh.count = 0 })
  }, [])

  const resetGrassGpuBuffers = () => {
    grassMeshRefs.current.forEach((mesh) => {
      if (!mesh) return
      mesh.count = 0
      mesh.instanceMatrix.needsUpdate = true
    })
    writtenChunkKeysRefs.current.forEach((set) => set.clear())
    nextGrassOffsetRefs.current = [0, 0, 0, 0]
  }

  // Write a single chunk directly into the correct quadrant GPU buffer — no React state involved.
  // Uses addUpdateRange so Three.js only uploads the new portion to the GPU (not the full 22 MB buffer).
  // After the partial upload we restore mesh.boundingSphere to the full quadrant sphere because
  // Three.js r175+ may recompute it from the new instances only, causing incorrect frustum culling.
  const writeChunkToGPU = (key, items) => {
    const [cx, cz] = key.split(':').map(Number)
    const qi = getChunkQuadrantIndex(cx, cz)
    if (writtenChunkKeysRefs.current[qi].has(key)) return
    const mesh = grassMeshRefs.current[qi]
    if (!mesh) return
    const startIndex = nextGrassOffsetRefs.current[qi]
    const arr = mesh.instanceMatrix.array
    items.forEach((grass) => {
      if (nextGrassOffsetRefs.current[qi] >= MAX_QUADRANT_INSTANCES) return
      const i = nextGrassOffsetRefs.current[qi] * 16
      const s = grass.scale
      const p = grass.position
      // Column-major TRS matrix with identity rotation (billboard handled in vertex shader)
      arr[i]    = s; arr[i+1]  = 0; arr[i+2]  = 0; arr[i+3]  = 0
      arr[i+4]  = 0; arr[i+5]  = s; arr[i+6]  = 0; arr[i+7]  = 0
      arr[i+8]  = 0; arr[i+9]  = 0; arr[i+10] = s; arr[i+11] = 0
      arr[i+12] = p[0]; arr[i+13] = p[1]; arr[i+14] = p[2]; arr[i+15] = 1
      nextGrassOffsetRefs.current[qi] += 1
    })
    writtenChunkKeysRefs.current[qi].add(key)
    const endIndex = nextGrassOffsetRefs.current[qi]
    mesh.count = endIndex
    if (endIndex > startIndex) {
      mesh.instanceMatrix.addUpdateRange({ start: startIndex * 16, count: (endIndex - startIndex) * 16 })
    }
    mesh.instanceMatrix.needsUpdate = true
    // Restore the full-quadrant bounding sphere so frustum culling is never based on a subset
    const sphere = grassQuadrantSpheres?.[qi]
    if (sphere) mesh.boundingSphere = sphere
  }

  const recordGrassBuildTime = (durationMs) => {
    if (!Number.isFinite(durationMs)) return
    const timing = grassBuildTimingRef.current
    timing.samples += 1
    timing.totalMs += durationMs
    timing.lastMs = durationMs
    timing.maxMs = Math.max(timing.maxMs, durationMs)
  }

  const estimateGrassVisibility = (camera) => {
    const mountedBlades = nextGrassOffsetRefs.current.reduce((sum, count) => sum + count, 0)
    if (!debugStats || !camera || mountedBlades <= 0) return null

    const playerPosition = playerPositionRef?.current
    if (!playerPosition) return null

    _grassDebugProjectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    _grassDebugFrustum.setFromProjectionMatrix(_grassDebugProjectionMatrix)

    const sampleStride = Math.max(1, Math.ceil(mountedBlades / GRASS_DEBUG_MAX_SAMPLES))
    let visited = 0
    let sampled = 0
    let kept = 0
    let inFrustum = 0
    let keptInFrustum = 0

    writtenChunkKeysRefs.current.forEach((keys) => {
      keys.forEach((key) => {
        const items = grassChunkCacheRef.current.get(key)
        if (!items) return

        items.forEach((grass) => {
          visited += 1
          if (visited % sampleStride !== 0) return

          sampled += 1
          const [x, y, z] = grass.position
          const dx = x - playerPosition.x
          const dz = z - playerPosition.z
          const distanceSq = dx * dx + dz * dz
          const fullDensityRadiusSq = GRASS_FULL_DENSITY_RADIUS * GRASS_FULL_DENSITY_RADIUS
          const thinningRadiusSq = GRASS_THINNING_RADIUS * GRASS_THINNING_RADIUS
          const thinningT = clamp01(
            (distanceSq - fullDensityRadiusSq)
              / Math.max(thinningRadiusSq - fullDensityRadiusSq, 0.0001),
          )
          let keepProbability = 1 + (GRASS_MIN_KEEP_PROBABILITY - 1) * thinningT
          const playerDistance = Math.sqrt(distanceSq)
          keepProbability *= 1 - smoothstep(GRASS_CULL_FADE_START, GRASS_CULL_RADIUS, playerDistance)
          const isKept = grassHash2(x, z) <= keepProbability
          _grassDebugPoint.set(x, y, z)
          const isInFrustum = _grassDebugFrustum.containsPoint(_grassDebugPoint)

          if (isKept) kept += 1
          if (isInFrustum) inFrustum += 1
          if (isKept && isInFrustum) keptInFrustum += 1
        })
      })
    })

    const scale = sampled > 0 ? mountedBlades / sampled : 0
    return {
      sampleStride,
      sampled,
      estimatedKeptBlades: Math.round(kept * scale),
      estimatedFrustumBlades: Math.round(inFrustum * scale),
      estimatedKeptFrustumBlades: Math.round(keptInFrustum * scale),
      estimatedHiddenBlades: Math.max(0, mountedBlades - Math.round(kept * scale)),
    }
  }

  const publishGrassDebugStats = () => {
    if (typeof window === 'undefined') return
    const writtenChunks = writtenChunkKeysRefs.current.reduce((sum, set) => sum + set.size, 0)
    const mountedBlades = nextGrassOffsetRefs.current.reduce((sum, count) => sum + count, 0)
    const completedChunks = grassChunkCacheRef.current.size
    let completedBlades = 0
    grassChunkCacheRef.current.forEach((items) => { completedBlades += items.length })
    const timing = grassBuildTimingRef.current
    window.__grassDebug = {
      queuedChunks: grassChunkQueueRef.current.length,
      pendingChunks: pendingGrassChunksRef.current.size,
      pendingGPUWrites: pendingGPUWriteRef.current.length,
      activeChunk: activeGrassCenterRef.current,
      targetChunks: activeGrassTargetKeysRef.current.size,
      completedChunks,
      mountedChunks: writtenChunks,
      mountedBlades,
      completedBlades,
      chunkBuildLastMs: timing.lastMs,
      chunkBuildAvgMs: timing.samples > 0 ? timing.totalMs / timing.samples : 0,
      chunkBuildMaxMs: timing.maxMs,
      visibilityEstimate: grassVisibilityEstimateRef.current,
    }
  }

  // Appelé depuis useFrame uniquement — les mesh refs sont garantis populés ici.
  // Phase 1 : vider la file d'attente GPU (chunks construits depuis useLayoutEffect ou frame précédente).
  // Phase 2 : construire de nouveaux chunks depuis la queue (budget 14 ms).
  const processGrassChunkBatch = () => {
    // Phase 1 — écriture GPU des chunks déjà construits (bootstrap ou frame précédente)
    let writes = 0
    while (
      pendingGPUWriteRef.current.length > 0
      && writes < GRASS_GPU_CHUNK_WRITES_PER_FRAME
    ) {
      const { key, grass } = pendingGPUWriteRef.current.shift()
      writeChunkToGPU(key, grass)
      writes += 1
    }

    // Phase 2 — construction de nouveaux chunks (budget temps)
    const startedAt = typeof performance !== 'undefined' ? performance.now() : 0
    while (true) {
      const nextKey = grassChunkQueueRef.current.shift()
      if (!nextKey) break
      const chunkStartedAt = typeof performance !== 'undefined' ? performance.now() : 0
      const grass = buildGrassChunk(nextKey)
      if (typeof performance !== 'undefined') recordGrassBuildTime(performance.now() - chunkStartedAt)
      grassChunkCacheRef.current.set(nextKey, grass)
      pendingGrassChunksRef.current.delete(nextKey)
      writeChunkToGPU(nextKey, grass)
      if (typeof performance !== 'undefined' && performance.now() - startedAt >= GRASS_CHUNK_BUILD_TIME_BUDGET_MS) break
    }

    publishGrassDebugStats()
  }

  // Initialise la queue quand active passe à true (ou que les clés changent).
  // NE PAS écrire sur le GPU ici — les mesh refs ne sont pas garantis prêts avant le premier useFrame.
  // Les chunks bootstrap sont mis dans pendingGPUWriteRef pour être écrits lors du prochain useFrame.
  const initGrassQueue = (playerPosition) => {
    const centerChunkX = playerPosition ? getGrassChunkIndex(playerPosition.x) : 0
    const centerChunkZ = playerPosition ? getGrassChunkIndex(playerPosition.z) : 0
    const activeKeys = getActiveGrassChunkKeys(allGrassChunkKeys, centerChunkX, centerChunkZ)
    const immediateKeySet = new Set(
      activeKeys.filter((key) => getGrassChunkDistance(key, centerChunkX, centerChunkZ) <= GRASS_IMMEDIATE_BOOTSTRAP_RADIUS),
    )
    activeGrassCenterRef.current = getGrassChunkKey(centerChunkX, centerChunkZ)
    activeGrassTargetKeysRef.current = new Set(activeKeys)
    grassChunkQueueRef.current = []
    pendingGPUWriteRef.current = []
    pendingGrassChunksRef.current.clear()
    resetGrassGpuBuffers()

    // Bootstrap : construire synchrone les chunks proches (ils seront écrits au prochain useFrame)
    const immediateKeys = activeKeys
      .filter((key) => immediateKeySet.has(key))
      .sort((a, b) => getGrassChunkDistance(a, centerChunkX, centerChunkZ) - getGrassChunkDistance(b, centerChunkX, centerChunkZ))

    immediateKeys.forEach((key) => {
      if (!grassChunkCacheRef.current.has(key)) {
        const chunkStartedAt = typeof performance !== 'undefined' ? performance.now() : 0
        const grass = buildGrassChunk(key)
        if (typeof performance !== 'undefined') recordGrassBuildTime(performance.now() - chunkStartedAt)
        grassChunkCacheRef.current.set(key, grass)
      }
      pendingGrassChunksRef.current.delete(key)
      grassChunkQueueRef.current = grassChunkQueueRef.current.filter((k) => k !== key)
      // Planifier l'écriture GPU (sera faite dans useFrame, pas ici)
      const cached = grassChunkCacheRef.current.get(key)
      if (cached) pendingGPUWriteRef.current.push({ key, grass: cached })
    })

    // Mettre aussi en file d'écriture tout chunk déjà en cache (visites précédentes)
    activeKeys.forEach((key) => {
      if (immediateKeySet.has(key)) return
      const cached = grassChunkCacheRef.current.get(key)
      if (cached) pendingGPUWriteRef.current.push({ key, grass: cached })
    })

    // Queue le reste pour construction progressive
    activeKeys.forEach((key) => {
      if (grassChunkCacheRef.current.has(key) || pendingGrassChunksRef.current.has(key)) return
      pendingGrassChunksRef.current.add(key)
      grassChunkQueueRef.current.push(key)
    })

    grassChunkQueueRef.current.sort((a, b) => (
      getGrassChunkDistance(a, centerChunkX, centerChunkZ) - getGrassChunkDistance(b, centerChunkX, centerChunkZ)
    ))

    publishGrassDebugStats()
  }

  useLayoutEffect(() => {
    activeGrassCenterRef.current = null

    if (active) {
      initGrassQueue(playerPositionRef?.current)
      return
    }

    // Retour à l'intérieur : vider la queue et les writes en attente
    grassChunkQueueRef.current = []
    pendingGPUWriteRef.current = []
    pendingGrassChunksRef.current.clear()
    activeGrassTargetKeysRef.current.clear()
    resetGrassGpuBuffers()

    publishGrassDebugStats()
  // The queue is deliberately rebuilt only when outdoor grass mounts/unmounts;
  // player chunk changes are handled in useFrame.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, allGrassChunkKeys])

  // Mise à jour incrémentale : ajoute les nouveaux chunks sans effacer le buffer GPU.
  // Les chunks stale hors rayon de thinning sont masqués automatiquement par le vertex shader.
  const updateGrassQueueIncremental = (centerChunkX, centerChunkZ) => {
    const activeKeys = getActiveGrassChunkKeys(allGrassChunkKeys, centerChunkX, centerChunkZ)
    const activeKeySet = new Set(activeKeys)
    activeGrassCenterRef.current = getGrassChunkKey(centerChunkX, centerChunkZ)
    activeGrassTargetKeysRef.current = activeKeySet

    grassChunkQueueRef.current = grassChunkQueueRef.current.filter((key) => activeKeySet.has(key))
    pendingGPUWriteRef.current = pendingGPUWriteRef.current.filter(({ key }) => activeKeySet.has(key))
    pendingGrassChunksRef.current.forEach((key) => {
      if (!activeKeySet.has(key)) pendingGrassChunksRef.current.delete(key)
    })

    activeKeys.forEach((key) => {
      const [kx, kz] = key.split(':').map(Number)
      const qi = getChunkQuadrantIndex(kx, kz)
      if (writtenChunkKeysRefs.current[qi].has(key)) return
      if (pendingGrassChunksRef.current.has(key)) return

      const cached = grassChunkCacheRef.current.get(key)
      if (cached) {
        pendingGPUWriteRef.current.push({ key, grass: cached })
      } else {
        pendingGrassChunksRef.current.add(key)
        grassChunkQueueRef.current.push(key)
      }
    })

    grassChunkQueueRef.current.sort((a, b) => (
      getGrassChunkDistance(a, centerChunkX, centerChunkZ) - getGrassChunkDistance(b, centerChunkX, centerChunkZ)
    ))

    publishGrassDebugStats()
  }

  useFrame(() => {
    if (!active) return

    const playerPosition = playerPositionRef?.current

    // Re-centrer si le joueur a changé de chunk
    if (playerPosition) {
      const centerChunkX = getGrassChunkIndex(playerPosition.x)
      const centerChunkZ = getGrassChunkIndex(playerPosition.z)
      const nextCenterKey = getGrassChunkKey(centerChunkX, centerChunkZ)
      if (activeGrassCenterRef.current !== nextCenterKey) {
        // Grand saut (téléportation) : reset complet. Mouvement normal : update incrémental.
        const prevKey = activeGrassCenterRef.current
        const [prevCX, prevCZ] = prevKey ? prevKey.split(':').map(Number) : [centerChunkX, centerChunkZ]
        const drift = Math.max(Math.abs(centerChunkX - prevCX), Math.abs(centerChunkZ - prevCZ))
        const mountedChunks = writtenChunkKeysRefs.current.reduce((sum, set) => sum + set.size, 0)
        const targetChunkCount = activeGrassTargetKeysRef.current.size || 1
        const shouldCompact = mountedChunks > targetChunkCount * GRASS_BUFFER_COMPACTION_RATIO
        if (drift > GRASS_ACTIVE_CHUNK_RADIUS || shouldCompact) {
          initGrassQueue(playerPosition)
        } else {
          updateGrassQueueIncremental(centerChunkX, centerChunkZ)
        }
      }
    }

    // Écriture GPU + construction progressive — s'exécute chaque frame tant qu'il y a du travail
    if (pendingGPUWriteRef.current.length > 0 || grassChunkQueueRef.current.length > 0) {
      processGrassChunkBatch()
    }
  })

  // Single useFrame for all grass uniforms (replaces one-per-chunk pattern)
  useFrame((state) => {
    const shader = shaderRef.current
    if (!shader) return
    shader.uniforms.uTime.value = state.clock.elapsedTime
    const pp = playerPositionRef?.current
    if (pp) shader.uniforms.uPlayerPosition.value.set(pp.x, pp.y, pp.z)
    const bp = ballRef?.current?.translation?.()
    if (bp) shader.uniforms.uBallPosition.value.set(bp.x, bp.y, bp.z)
    else shader.uniforms.uBallPosition.value.set(9999, 0, 9999)
    _cameraForward.set(0, 0, -1).applyQuaternion(state.camera.quaternion)
    _cameraForward.y = 0
    if (_cameraForward.lengthSq() > 0.0001) _cameraForward.normalize()
    shader.uniforms.uCameraForward.value.copy(_cameraForward)

    if (debugStats && typeof performance !== 'undefined') {
      const now = performance.now()
      if (now - lastGrassDebugEstimateAtRef.current >= GRASS_DEBUG_ESTIMATE_INTERVAL_MS) {
        lastGrassDebugEstimateAtRef.current = now
        grassVisibilityEstimateRef.current = estimateGrassVisibility(state.camera)
        publishGrassDebugStats()
      }
    }
  })

  // Nettoyage au démontage
  useEffect(() => () => {
    grassChunkQueueRef.current = []
    pendingGPUWriteRef.current = []
    pendingGrassChunksRef.current.clear()
  }, [])

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
