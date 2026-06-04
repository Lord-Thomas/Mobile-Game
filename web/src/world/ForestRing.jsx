import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Object3D } from 'three'
import { FOREST_TREES } from './outdoorData'
import { getTerrainHeight } from './terrain/terrainGeometry'

const dummy = new Object3D()

function InstancedTrees({ castShadows = true }) {
  const trunkRef = useRef()
  const foliageARef = useRef()
  const foliageBRef = useRef()
  const trunkColor = useMemo(() => new Color('#735235'), [])
  const foliageDark = useMemo(() => new Color('#2f7752'), [])
  const foliageLight = useMemo(() => new Color('#3c8a5f'), [])

  useLayoutEffect(() => {
    FOREST_TREES.forEach(([x, z, scale], index) => {
      const y = getTerrainHeight(x, z)
      const rotationY = ((index * 37) % 360) * (Math.PI / 180)

      dummy.position.set(x, y + 0.72 * scale, z)
      dummy.rotation.set(0, rotationY, 0)
      dummy.scale.set(0.95 * scale, scale, 0.95 * scale)
      dummy.updateMatrix()
      trunkRef.current.setMatrixAt(index, dummy.matrix)
      trunkRef.current.setColorAt(index, trunkColor)

      dummy.position.set(x, y + 1.75 * scale, z)
      dummy.rotation.set(0, rotationY, 0)
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix()
      foliageARef.current.setMatrixAt(index, dummy.matrix)
      foliageARef.current.setColorAt(index, foliageDark.clone().lerp(foliageLight, (index % 5) / 5))

      dummy.position.set(x, y + 2.42 * scale, z)
      dummy.rotation.set(0, rotationY + 0.35, 0)
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix()
      foliageBRef.current.setMatrixAt(index, dummy.matrix)
      foliageBRef.current.setColorAt(index, foliageLight.clone().lerp(foliageDark, (index % 4) / 6))
    })

    ;[trunkRef, foliageARef, foliageBRef].forEach((ref) => {
      ref.current.instanceMatrix.needsUpdate = true
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
    })
  }, [foliageDark, foliageLight, trunkColor])

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, FOREST_TREES.length]} castShadow={castShadows} receiveShadow={castShadows}>
        <cylinderGeometry args={[0.16, 0.22, 1.45, 8]} />
        <meshStandardMaterial roughness={0.86} vertexColors />
      </instancedMesh>
      <instancedMesh ref={foliageARef} args={[undefined, undefined, FOREST_TREES.length]} castShadow={castShadows}>
        <coneGeometry args={[0.92, 1.8, 9]} />
        <meshStandardMaterial roughness={0.8} vertexColors />
      </instancedMesh>
      <instancedMesh ref={foliageBRef} args={[undefined, undefined, FOREST_TREES.length]} castShadow={castShadows}>
        <coneGeometry args={[0.68, 1.35, 9]} />
        <meshStandardMaterial roughness={0.8} vertexColors />
      </instancedMesh>
    </group>
  )
}

function ForestRing({ castShadows = true }) {
  return (
    <group>
      <InstancedTrees castShadows={castShadows} />
      <mesh position={[0, 0.05, -39]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[70, 3]} />
        <meshStandardMaterial color="#5e8e67" roughness={0.9} />
      </mesh>
    </group>
  )
}

export default ForestRing
