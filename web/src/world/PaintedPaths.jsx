import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useTexture } from '@react-three/drei'
import {
  DataTexture,
  LinearFilter,
  Object3D,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
} from 'three'
import { getTerrainHeight } from './terrain/terrainGeometry'
import { PATH_TYPES } from './paths'

// Painting remains a compact list of brush samples in the saved map, but it is
// rendered as one instanced textured layer per material. The GPU cost therefore
// depends on the number of materials, not on the number of visible brush marks.
const PATH_CAPACITY = 8192
const PATH_Y_OFFSET = 0.055
const ALPHA_MAP_SIZE = 64
const dummy = new Object3D()
const PATH_NORMAL_SCALE = new Vector2(0.55, 0.55)

function createFeatheredAlphaMap() {
  const data = new Uint8Array(ALPHA_MAP_SIZE * ALPHA_MAP_SIZE * 4)
  const half = ALPHA_MAP_SIZE / 2

  for (let y = 0; y < ALPHA_MAP_SIZE; y += 1) {
    for (let x = 0; x < ALPHA_MAP_SIZE; x += 1) {
      const distance = Math.hypot((x + 0.5 - half) / half, (y + 0.5 - half) / half)
      // Opaque over most of the brush, then a broad smooth falloff that lets
      // the terrain texture show through instead of drawing a hard circle.
      const edge = Math.min(1, Math.max(0, (1 - distance) / 0.24))
      const smooth = edge * edge * (3 - (2 * edge))
      const value = Math.round(smooth * 255)
      const offset = ((y * ALPHA_MAP_SIZE) + x) * 4
      data[offset] = value
      data[offset + 1] = value
      data[offset + 2] = value
      data[offset + 3] = 255
    }
  }

  const texture = new DataTexture(data, ALPHA_MAP_SIZE, ALPHA_MAP_SIZE, RGBAFormat, UnsignedByteType)
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

function cloneSurfaceTexture(source, { color = false } = {}) {
  const texture = source.clone()
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  if (color) texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function stampRotation(stamp) {
  const [x = 0, z = 0] = stamp.center ?? []
  const seed = Math.sin((x * 12.9898) + (z * 78.233)) * 43758.5453
  return (seed - Math.floor(seed)) * Math.PI * 2
}

function PathLayer({ stamps, definition, terrainVersion = 0 }) {
  const meshRef = useRef()
  const [sourceMap, sourceNormalMap, sourceRoughnessMap] = useTexture([
    definition.map,
    definition.normalMap,
    definition.roughnessMap,
  ])
  const map = useMemo(() => cloneSurfaceTexture(sourceMap, { color: true }), [sourceMap])
  const normalMap = useMemo(() => cloneSurfaceTexture(sourceNormalMap), [sourceNormalMap])
  const roughnessMap = useMemo(() => cloneSurfaceTexture(sourceRoughnessMap), [sourceRoughnessMap])
  const alphaMap = useMemo(() => createFeatheredAlphaMap(), [])

  useEffect(() => () => {
    map.dispose()
    normalMap.dispose()
    roughnessMap.dispose()
    alphaMap.dispose()
  }, [alphaMap, map, normalMap, roughnessMap])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const count = Math.min(stamps.length, PATH_CAPACITY)

    for (let i = 0; i < count; i += 1) {
      const stamp = stamps[i]
      const [x, z] = stamp.center
      dummy.position.set(x, getTerrainHeight(x, z, true) + PATH_Y_OFFSET, z)
      dummy.rotation.set(-Math.PI / 2, 0, stampRotation(stamp))
      dummy.scale.set(stamp.width, stamp.width, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }

    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
  }, [stamps, terrainVersion])

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, PATH_CAPACITY]}
      frustumCulled={false}
      receiveShadow
    >
      <circleGeometry args={[0.5, 32]} />
      <meshStandardMaterial
        map={map}
        normalMap={normalMap}
        normalScale={PATH_NORMAL_SCALE}
        roughnessMap={roughnessMap}
        alphaMap={alphaMap}
        color={definition.tint ?? '#ffffff'}
        roughness={1}
        metalness={0}
        transparent
        alphaTest={0.025}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </instancedMesh>
  )
}

export default function PaintedPaths({ paths = [], terrainVersion = 0 }) {
  const byType = useMemo(() => {
    const groups = {}
    for (const stamp of paths) {
      const type = PATH_TYPES[stamp.type] ? stamp.type : 'dirt'
      if (!groups[type]) groups[type] = []
      groups[type].push(stamp)
    }
    return groups
  }, [paths])

  return (
    <group userData={{ debugCategory: 'paths' }}>
      {Object.entries(byType).map(([type, stamps]) => (
        <PathLayer
          key={type}
          stamps={stamps}
          definition={PATH_TYPES[type]}
          terrainVersion={terrainVersion}
        />
      ))}
    </group>
  )
}
