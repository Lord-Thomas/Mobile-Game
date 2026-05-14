import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { getTerrainHeight } from '../terrain/terrainGeometry'
import { createProceduralTree, normalizeTreeConfig } from './proceduralTreeConfig'

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

function ProceduralTree({ config }) {
  const treeRef = useRef(null)
  const normalized = useMemo(() => normalizeTreeConfig(config), [config])
  const tree = useMemo(() => createProceduralTree(normalized), [normalized])
  const terrainY = normalized.snapToGround
    ? getTerrainHeight(normalized.position.x, normalized.position.z)
    : 0

  useEffect(() => {
    treeRef.current = tree
    return () => disposeTree(tree)
  }, [tree])

  useFrame(({ clock }) => {
    treeRef.current?.update(clock.getElapsedTime())
  })

  return (
    <primitive
      object={tree}
      position={[
        normalized.position.x,
        terrainY + normalized.position.y,
        normalized.position.z,
      ]}
      rotation={[0, normalized.rotationY, 0]}
      scale={normalized.scale}
    />
  )
}

export default ProceduralTree
