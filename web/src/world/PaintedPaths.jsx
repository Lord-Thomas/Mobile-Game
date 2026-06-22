import { useLayoutEffect, useMemo, useRef } from 'react'
import { Object3D } from 'three'
import { getTerrainHeight } from './terrain/terrainGeometry'
import { PATH_TYPES } from './paths'

// Fixed instance capacity per path type. Sizing the buffer to the live stamp
// count would force R3F to recreate the instanced mesh on every painted stamp;
// a generous fixed capacity lets us just bump `count` instead.
const PATH_CAPACITY = 8192
const PATH_Y_OFFSET = 0.05
const dummy = new Object3D()

function PathLayer({ stamps, color, terrainVersion = 0 }) {
  const meshRef = useRef()

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const count = Math.min(stamps.length, PATH_CAPACITY)
    for (let i = 0; i < count; i += 1) {
      const [x, z] = stamps[i].center
      dummy.position.set(x, getTerrainHeight(x, z, true) + PATH_Y_OFFSET, z)
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.scale.set(stamps[i].width, stamps[i].width, 1)
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
      <circleGeometry args={[0.5, 18]} />
      <meshStandardMaterial
        color={color}
        roughness={1}
        metalness={0}
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
      (groups[stamp.type] ??= []).push(stamp)
    }
    return groups
  }, [paths])

  return (
    <group userData={{ debugCategory: 'paths' }}>
      {Object.entries(byType).map(([type, stamps]) => (
        <PathLayer
          key={type}
          stamps={stamps}
          color={PATH_TYPES[type]?.color ?? '#6f5d44'}
          terrainVersion={terrainVersion}
        />
      ))}
    </group>
  )
}
