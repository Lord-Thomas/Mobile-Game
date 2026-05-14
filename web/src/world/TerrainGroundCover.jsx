import { useLayoutEffect, useMemo, useRef } from 'react'
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
const GRASS_TEXTURE = '/textures/outdoor/grass-001.png'
const grassTintLow = new Color('#f4ffe8')
const grassTintMid = new Color('#ffffff')
const grassTintHigh = new Color('#fbfff0')

function hashNoise(x, z) {
  const value = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453
  return value - Math.floor(value)
}

function getGrassTintFromNoise(x, z) {
  const n = hashNoise(Math.floor(x * 0.08), Math.floor(z * 0.08))
  if (n < 0.5) return grassTintLow.clone().lerp(grassTintMid, n / 0.5)
  return grassTintMid.clone().lerp(grassTintHigh, (n - 0.5) / 0.5)
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
  const height = 0.78
  const cardAngles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]
  const positions = []
  const uvs = []
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
    })

    indices.push(base, base + 1, base + 2)
    indices.push(base + 1, base + 3, base + 2)
  })

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
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

function createGroundCover() {
  const grass = []
  const rocks = []

  for (let xi = -36; xi <= 36; xi += 0.13) {
    for (let zi = -36; zi <= 36; zi += 0.13) {
      const seed = (xi + 61) * 197 + (zi + 43) * 137
      const x = xi + (seededRandom(seed) - 0.5) * grassPlacementSettings.positionJitter * 2
      const z = zi + (seededRandom(seed + 5) - 0.5) * grassPlacementSettings.positionJitter * 2
      const density = Math.min(1, Math.max(getZoneDensity('tall_grass', x, z), getZoneDensity('lawn_blade', x, z) * 0.9) * 9.5)
      if (seededRandom(seed + 19) < density) grass.push(makeGrassInstance(x, z, seed))
    }
  }

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

  return { grass, rocks }
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
      ref.current.setColorAt(index, getGrassTintFromNoise(grass.position[0], grass.position[2]))
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [items])

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]} frustumCulled>
      <meshStandardMaterial
        map={texture}
        alphaTest={0.45}
        transparent={false}
        depthWrite
        side={DoubleSide}
        color="#ffffff"
        roughness={1}
        emissive="#ffffff"
        emissiveMap={texture}
        emissiveIntensity={0.42}
        vertexColors
      />
    </instancedMesh>
  )
}

function TerrainGroundCover() {
  const { grass, rocks } = useMemo(() => createGroundCover(), [])
  const ref = useRef()

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
      <GrassLayer items={grass} />
      <instancedMesh ref={ref} args={[undefined, undefined, rocks.length]} frustumCulled>
        <dodecahedronGeometry args={[0.48, 0]} />
        <meshBasicMaterial color="#9d9688" />
      </instancedMesh>
    </group>
  )
}

export default TerrainGroundCover
