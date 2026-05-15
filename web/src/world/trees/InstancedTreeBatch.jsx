import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Matrix4, Object3D } from 'three'
import { getTerrainHeight } from '../terrain/terrainGeometry'
import { createProceduralTree, treeLeafWindUniforms } from './proceduralTreeConfig'
import { GAME_TREE_LIBRARY } from './treeLibrary'

const dummy = new Object3D()
const localMatrix = new Matrix4()

function disposeTree(tree) {
  tree.traverse((object) => {
    object.geometry?.dispose()
    if (!object.material) return
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => material.dispose())
      return
    }
    object.material.dispose()
  })
}

function collectRenderableParts(tree) {
  tree.updateMatrixWorld(true)
  const parts = []

  tree.traverse((object) => {
    if (!object.isMesh || !object.geometry || !object.material) return
    parts.push({
      geometry: object.geometry,
      material: object.material,
      matrix: object.matrixWorld.clone(),
      castShadow: object.castShadow,
      receiveShadow: object.receiveShadow,
    })
  })

  return parts
}

function InstancedTreePart({ part, placements }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    placements.forEach((tree, index) => {
      const { position, rotationY, scale, snapToGround } = tree.config
      const terrainY = snapToGround ? getTerrainHeight(position.x, position.z) : 0
      dummy.position.set(position.x, terrainY + position.y, position.z)
      dummy.rotation.set(0, rotationY, 0)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      localMatrix.multiplyMatrices(dummy.matrix, part.matrix)
      ref.current.setMatrixAt(index, localMatrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [part.matrix, placements])

  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, part.material, placements.length]}
      castShadow={part.castShadow}
      receiveShadow={part.receiveShadow}
      frustumCulled
    />
  )
}

function InstancedTreeVariant({ variantId, placements, animated }) {
  const variant = GAME_TREE_LIBRARY[variantId] ?? GAME_TREE_LIBRARY.ashMedium
  const tree = useMemo(() => createProceduralTree(variant.config, animated), [variant, animated])
  const parts = useMemo(() => collectRenderableParts(tree), [tree])

  useEffect(() => () => disposeTree(tree), [tree])

  return parts.map((part, index) => (
    <InstancedTreePart
      key={`${variantId}-${index}`}
      part={part}
      placements={placements}
    />
  ))
}

function InstancedTreeBatch({ trees, animated = true }) {
  const groups = useMemo(() => {
    const next = new Map()
    trees.forEach((tree) => {
      if (!next.has(tree.variantId)) next.set(tree.variantId, [])
      next.get(tree.variantId).push(tree)
    })
    return [...next.entries()]
  }, [trees])

  // Single useFrame for all animated variants — updates the shared uniform object once,
  // which propagates instantly to every leaf shader without re-uploading any geometry.
  useFrame(({ clock }) => {
    if (animated) treeLeafWindUniforms.uTime.value = clock.getElapsedTime()
  })

  return (
    <group userData={{ debugCategory: 'trees' }}>
      {groups.map(([variantId, placements]) => (
        <InstancedTreeVariant
          key={variantId}
          variantId={variantId}
          placements={placements}
          animated={animated}
        />
      ))}
    </group>
  )
}

export default InstancedTreeBatch
