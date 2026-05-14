import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTexture } from '@react-three/drei'
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, MathUtils, Object3D, SRGBColorSpace, Vector3 } from 'three'
import { getTerrainHeight } from './terrain/terrainGeometry'
import { canPlaceObject, getZoneDensity } from './worldZones'

const dummy = new Object3D()
const grassPlacementSettings = {
  rotationRandomness: Math.PI,
  positionJitter: 0.45,
  minScale: 0.18,
  maxScale: 0.3,
}
const GRASS_AREA_MIN = -36
const GRASS_AREA_MAX = 36
const GRASS_GRID_STEP = 0.13
const GRASS_DENSITY_MULTIPLIER = 9.5
const GRASS_ROWS_PER_IDLE_BATCH = 14
const GRASS_TEXTURE = '/textures/outdoor/grass-001-white.png'
const grassBottomColor = new Color('#526f18')
const grassMiddleColor = new Color('#6f970e')
const grassTopColor = new Color('#a4c83b')

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
  const height = 0.78
  const cardAngles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]
  const positions = []
  const uvs = []
  const colors = []
  const indices = []

  cardAngles.forEach((angle, cardIndex) => {
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const base = cardIndex * 4
    const corners = [
      [-width * 0.5, 0, 0, 0, 0],
      [width * 0.5, 0, 0, 1, 0],
      [-width * 0.5, height, 0, 0, 1],
      [width * 0.5, height, 0, 1, 1],
    ]

    corners.forEach(([x, y, z, u, v]) => {
      positions.push(x * cos - z * sin, y, x * sin + z * cos)
      uvs.push(u, v)
      const verticalT = MathUtils.clamp(y / height, 0, 1)
      const color = verticalT < 0.55
        ? grassBottomColor.clone().lerp(grassMiddleColor, verticalT / 0.55)
        : grassMiddleColor.clone().lerp(grassTopColor, (verticalT - 0.55) / 0.45)
      colors.push(color.r, color.g, color.b)
    })

    indices.push(base, base + 1, base + 2)
    indices.push(base + 1, base + 3, base + 2)
  })

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

function makeRockInstance(x, z, seed) {
  return {
    position: [x, getTerrainHeight(x, z) + 0.03, z],
    rotation: [0, seededRandom(seed + 18) * Math.PI * 2, 0],
    scale: 0.75 + seededRandom(seed + 9) * 0.65,
    colorShift: seededRandom(seed + 41),
  }
}

function makeGrassInstance(x, z, seed) {
  const scaleRange = grassPlacementSettings.maxScale - grassPlacementSettings.minScale
  return {
    position: [x, getTerrainHeight(x, z) + 0.032, z],
    rotation: [0, (seededRandom(seed + 18) - 0.5) * grassPlacementSettings.rotationRandomness * 2, 0],
    scale: grassPlacementSettings.minScale + seededRandom(seed + 9) * scaleRange,
    colorShift: seededRandom(seed + 41),
  }
}

function pushGrassRow(grass, xi) {
  for (let zi = GRASS_AREA_MIN; zi <= GRASS_AREA_MAX; zi += GRASS_GRID_STEP) {
    const seed = (xi + 61) * 197 + (zi + 43) * 137
    const x = xi + (seededRandom(seed) - 0.5) * grassPlacementSettings.positionJitter * 2
    const z = zi + (seededRandom(seed + 5) - 0.5) * grassPlacementSettings.positionJitter * 2
    const density = Math.min(
      1,
      Math.max(getZoneDensity('tall_grass', x, z), getZoneDensity('lawn_blade', x, z) * 0.9) * GRASS_DENSITY_MULTIPLIER,
    )
    if (seededRandom(seed + 19) < density) grass.push(makeGrassInstance(x, z, seed))
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

function GrassLayer({ items }) {
  const texture = useTexture(GRASS_TEXTURE)
  const geometry = useMemo(() => createGrassCardGeometry(), [])
  const ref = useRef()

  useMemo(() => {
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true
  }, [texture])

  useLayoutEffect(() => {
    items.forEach((grass, index) => {
      dummy.position.set(...grass.position)
      dummy.rotation.set(...grass.rotation)
      dummy.scale.setScalar(grass.scale)
      dummy.updateMatrix()
      ref.current.setMatrixAt(index, dummy.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [items])

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]} frustumCulled>
      <meshBasicMaterial
        map={texture}
        alphaTest={0.45}
        side={DoubleSide}
        transparent={false}
        depthWrite
        color="#ffffff"
        vertexColors
      />
    </instancedMesh>
  )
}

function TerrainGroundCover() {
  const rocks = useMemo(() => createRockCover(), [])
  const [grass, setGrass] = useState(null)
  const ref = useRef()

  useEffect(() => {
    if (grass) return undefined

    let cancelled = false
    const nextGrass = []
    let xi = GRASS_AREA_MIN
    let timeoutId = null
    let idleId = null

    const schedule = (callback) => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(callback, { timeout: 80 })
        return
      }
      timeoutId = window.setTimeout(() => callback(), 0)
    }

    const runBatch = (deadline) => {
      let rows = 0

      while (
        xi <= GRASS_AREA_MAX
        && rows < GRASS_ROWS_PER_IDLE_BATCH
        && (!deadline || deadline.timeRemaining() > 2)
      ) {
        pushGrassRow(nextGrass, xi)
        xi += GRASS_GRID_STEP
        rows += 1
      }

      if (cancelled) return

      if (xi <= GRASS_AREA_MAX) {
        schedule(runBatch)
      } else {
        setGrass(nextGrass)
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
  }, [grass])

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
    <group>
      {grass && <GrassLayer items={grass} />}
      <instancedMesh ref={ref} args={[undefined, undefined, rocks.length]} frustumCulled>
        <dodecahedronGeometry args={[0.48, 0]} />
        <meshBasicMaterial color="#9d9688" />
      </instancedMesh>
    </group>
  )
}

export default TerrainGroundCover
