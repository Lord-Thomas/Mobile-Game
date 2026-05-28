import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { InstancedBufferAttribute, MathUtils, Matrix4, Object3D, Vector3 } from 'three'
import { getTerrainHeight } from '../terrain/terrainGeometry'
import { createProceduralTree, treeLeafWindUniforms } from './proceduralTreeConfig'
import { GAME_TREE_LIBRARY } from './treeLibrary'

const dummy = new Object3D()
const localMatrix = new Matrix4()
const cameraToPlayer = new Vector3()
const playerTarget = new Vector3()
const cameraOrigin = new Vector3()

const TREE_OCCLUSION_MIN_VISIBILITY = 0.22
const TREE_OCCLUSION_SOFT_RADIUS = 1.45
const TREE_OCCLUSION_FADE_IN_SPEED = 10
const TREE_OCCLUSION_FADE_OUT_SPEED = 5

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

function makeOcclusionMaterial(material) {
  const previousOnBeforeCompile = material.onBeforeCompile
  const previousProgramKey = material.customProgramCacheKey?.bind(material)
  const next = material.clone()
  next.transparent = false
  next.depthWrite = true
  next.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile?.(shader, renderer)

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `
      #include <common>
      attribute float instanceOcclusionOpacity;
      varying float vInstanceOcclusionOpacity;
      `,
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vInstanceOcclusionOpacity = instanceOcclusionOpacity;
      `,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `
      #include <common>
      varying float vInstanceOcclusionOpacity;
      `,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      if (vInstanceOcclusionOpacity < 0.999) {
        float treeOcclusionNoise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        if (treeOcclusionNoise > vInstanceOcclusionOpacity) discard;
      }
      #include <dithering_fragment>
      `,
    )
  }
  next.customProgramCacheKey = () => `${previousProgramKey?.() ?? 'tree-base'}-occlusion-dither-v2`
  return next
}

function InstancedTreePart({ part, placements, meshRefs, opacityAttributesRef, partIndex }) {
  const ref = useRef(null)
  const material = useMemo(() => makeOcclusionMaterial(part.material), [part.material])
  const opacityAttribute = useMemo(
    () => new InstancedBufferAttribute(new Float32Array(placements.length).fill(1), 1),
    [placements.length],
  )

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
    ref.current.geometry.setAttribute('instanceOcclusionOpacity', opacityAttribute)
    ref.current.instanceMatrix.needsUpdate = true
  }, [opacityAttribute, part.matrix, placements])

  useLayoutEffect(() => {
    meshRefs.current[partIndex] = ref.current
    opacityAttributesRef.current[partIndex] = opacityAttribute
    return () => {
      meshRefs.current[partIndex] = null
      opacityAttributesRef.current[partIndex] = null
    }
  }, [meshRefs, opacityAttribute, opacityAttributesRef, partIndex])

  useEffect(() => () => material.dispose(), [material])

  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, material, placements.length]}
      castShadow={part.castShadow}
      receiveShadow={part.receiveShadow}
      frustumCulled
    />
  )
}

function InstancedTreeVariant({ variantId, placements, animated, playerPositionRef }) {
  const variant = GAME_TREE_LIBRARY[variantId] ?? GAME_TREE_LIBRARY.ashMedium
  const tree = useMemo(() => createProceduralTree(variant.config, animated), [variant, animated])
  const parts = useMemo(() => collectRenderableParts(tree), [tree])
  const meshRefs = useRef([])
  const opacityAttributesRef = useRef([])
  const currentOpacitiesRef = useRef(new Float32Array(placements.length).fill(1))
  const targetOpacitiesRef = useRef(new Float32Array(placements.length).fill(1))

  useEffect(() => () => disposeTree(tree), [tree])

  useEffect(() => {
    currentOpacitiesRef.current = new Float32Array(placements.length).fill(1)
    targetOpacitiesRef.current = new Float32Array(placements.length).fill(1)
  }, [placements.length])

  useFrame(({ camera }, delta) => {
    if (!playerPositionRef?.current || placements.length === 0) return

    const targets = targetOpacitiesRef.current
    targets.fill(1)

    playerTarget.set(
      playerPositionRef.current.x,
      playerPositionRef.current.y + 0.8,
      playerPositionRef.current.z,
    )
    cameraOrigin.copy(camera.position)
    cameraToPlayer.subVectors(playerTarget, cameraOrigin)
    const rayDistance = cameraToPlayer.length()
    if (rayDistance < 0.1) return

    const segmentX = playerTarget.x - cameraOrigin.x
    const segmentZ = playerTarget.z - cameraOrigin.z
    const segmentLengthSq = segmentX * segmentX + segmentZ * segmentZ
    if (segmentLengthSq < 0.0001) return

    placements.forEach((tree, index) => {
      const treeX = tree.config.position.x
      const treeZ = tree.config.position.z
      const treeToCameraX = treeX - cameraOrigin.x
      const treeToCameraZ = treeZ - cameraOrigin.z
      const along = MathUtils.clamp(
        (treeToCameraX * segmentX + treeToCameraZ * segmentZ) / segmentLengthSq,
        0,
        1,
      )
      if (along <= 0.03 || along >= 0.96) return

      const closestX = cameraOrigin.x + segmentX * along
      const closestZ = cameraOrigin.z + segmentZ * along
      const distanceToViewLine = Math.hypot(treeX - closestX, treeZ - closestZ)
      const trunkRadius = tree.colliderRadius ?? 0.6
      const hardRadius = Math.max(0.75, trunkRadius * 1.45)
      const softRadius = hardRadius + TREE_OCCLUSION_SOFT_RADIUS
      if (distanceToViewLine >= softRadius) return

      const fade = 1 - MathUtils.smoothstep(distanceToViewLine, hardRadius, softRadius)
      const targetOpacity = MathUtils.lerp(1, TREE_OCCLUSION_MIN_VISIBILITY, fade)
      targets[index] = Math.min(targets[index], targetOpacity)
    })

    const current = currentOpacitiesRef.current
    let changed = false
    for (let index = 0; index < current.length; index += 1) {
      const target = targets[index]
      const speed = target < current[index] ? TREE_OCCLUSION_FADE_IN_SPEED : TREE_OCCLUSION_FADE_OUT_SPEED
      const next = MathUtils.damp(current[index], target, speed, delta)
      if (Math.abs(next - current[index]) > 0.001) {
        current[index] = next
        changed = true
      }
    }
    if (!changed) return

    opacityAttributesRef.current.forEach((attribute) => {
      if (!attribute) return
      attribute.array.set(current)
      attribute.needsUpdate = true
    })
  })

  return parts.map((part, index) => (
    <InstancedTreePart
      key={`${variantId}-${index}`}
      part={part}
      placements={placements}
      meshRefs={meshRefs}
      opacityAttributesRef={opacityAttributesRef}
      partIndex={index}
    />
  ))
}

function InstancedTreeBatch({ trees, animated = true, playerPositionRef = null }) {
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
          playerPositionRef={playerPositionRef}
        />
      ))}
    </group>
  )
}

export default InstancedTreeBatch
