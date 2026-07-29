import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { InstancedBufferAttribute, MathUtils, Matrix4, Object3D, Vector3 } from 'three'
import { getTerrainHeight } from '../terrain/terrainGeometry'
import { createProceduralTree, createSimplifiedTreeConfig, treeLeafWindUniforms } from './proceduralTreeConfig'
import { GAME_TREE_LIBRARY } from './treeLibrary'
import {
  getArtDirectionColorMultiplier,
  useArtDirectionValues,
} from '../../artDirection/artDirectionStore'

const dummy = new Object3D()
const localMatrix = new Matrix4()
const cameraToPlayer = new Vector3()
const playerTarget = new Vector3()
const cameraOrigin = new Vector3()

const TREE_OCCLUSION_MIN_VISIBILITY = 0.22
const TREE_OCCLUSION_SOFT_RADIUS = 1.45
const TREE_OCCLUSION_FADE_IN_SPEED = 16
const TREE_OCCLUSION_FADE_OUT_SPEED = 14
const TREE_CAMERA_CLEAR_RADIUS = 1.2
const TREE_CAMERA_MIN_VISIBILITY = 0.20
const TREE_LOD_UPDATE_INTERVAL = 0.32
// Un unique InstancedMesh couvrant toute la carte ne peut jamais être éliminé par
// le frustum de la caméra ou de la shadow map. Des lots spatiaux gardent
// l'instancing, tout en permettant à Three de ne dessiner que les zones utiles.
const TREE_SPATIAL_BATCH_SIZE = 48
const TREE_LOD_THRESHOLDS = [
  { enter: 32, exit: 28 },
  { enter: 52, exit: 46 },
  { enter: 74, exit: 66 },
]

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
    next.userData.shader = shader

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
      float treeBayer4(vec2 p) {
        int x = int(mod(floor(p.x), 4.0));
        int y = int(mod(floor(p.y), 4.0));
        int idx = x + y * 4;
        if (idx == 0)  return  0.5/16.0;
        if (idx == 1)  return  8.5/16.0;
        if (idx == 2)  return  2.5/16.0;
        if (idx == 3)  return 10.5/16.0;
        if (idx == 4)  return 12.5/16.0;
        if (idx == 5)  return  4.5/16.0;
        if (idx == 6)  return 14.5/16.0;
        if (idx == 7)  return  6.5/16.0;
        if (idx == 8)  return  3.5/16.0;
        if (idx == 9)  return 11.5/16.0;
        if (idx == 10) return  1.5/16.0;
        if (idx == 11) return  9.5/16.0;
        if (idx == 12) return 15.5/16.0;
        if (idx == 13) return  7.5/16.0;
        if (idx == 14) return 13.5/16.0;
        return 5.5/16.0;
      }
      `,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      if (vInstanceOcclusionOpacity < 0.999) {
        if (vInstanceOcclusionOpacity < treeBayer4(gl_FragCoord.xy)) discard;
      }
      #include <dithering_fragment>
      `,
    )
  }
  next.customProgramCacheKey = () => `${previousProgramKey?.() ?? 'tree-base'}-occlusion-bayer4-v1`
  return next
}

function InstancedTreePart({
  part,
  capacity,
  castShadows,
  lodLevel,
  lodPlacementsRef,
  onOpacityAttribute,
  onInstanceUpdater,
  partIndex,
  occlusionEnabled,
}) {
  const ref = useRef(null)
  // Per-instance opacity is stored on the geometry. Only the near LOD needs
  // that feature; all other batches can share the generated geometry directly.
  const geometry = useMemo(
    () => occlusionEnabled ? part.geometry.clone() : part.geometry,
    [occlusionEnabled, part.geometry],
  )
  const opacityAttribute = useMemo(
    () => occlusionEnabled
      ? new InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1)
      : null,
    [capacity, occlusionEnabled],
  )

  const updateInstances = useCallback(() => {
    const placements = lodPlacementsRef.current[lodLevel]
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
    ref.current.count = placements.length
    if (opacityAttribute) {
      ref.current.geometry.setAttribute('instanceOcclusionOpacity', opacityAttribute)
    }
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingBox()
    ref.current.computeBoundingSphere()
  }, [lodLevel, lodPlacementsRef, opacityAttribute, part.matrix])

  useLayoutEffect(() => {
    updateInstances()
  }, [updateInstances])

  useLayoutEffect(() => {
    if (!opacityAttribute) return undefined
    onOpacityAttribute(partIndex, opacityAttribute)
    return () => onOpacityAttribute(partIndex, null)
  }, [onOpacityAttribute, opacityAttribute, partIndex])

  useLayoutEffect(() => {
    onInstanceUpdater(partIndex, updateInstances)
    return () => onInstanceUpdater(partIndex, null)
  }, [onInstanceUpdater, partIndex, updateInstances])

  useEffect(() => () => {
    if (occlusionEnabled) geometry.dispose()
  }, [geometry, occlusionEnabled])

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, part.occlusionMaterial ?? part.material, capacity]}
      castShadow={castShadows && part.castShadow}
      receiveShadow={part.receiveShadow}
      frustumCulled
    />
  )
}

function InstancedTreeRuntime({
  lodPlacementsRef,
  lodLevel,
  lodVersionRef,
  playerPositionRef,
  instanceUpdatersRef,
  opacityAttributesRef,
  currentOpacitiesRef,
  targetOpacitiesRef,
  opacityVersionRef,
}) {
  const appliedInstanceVersionRef = useRef(-1)

  useFrame(({ camera }, delta) => {
    if (appliedInstanceVersionRef.current !== lodVersionRef.current) {
      instanceUpdatersRef.current.forEach((updateInstances) => updateInstances?.())
      appliedInstanceVersionRef.current = lodVersionRef.current
    }

    const placements = lodPlacementsRef.current[lodLevel]
    if (!playerPositionRef?.current || placements.length === 0) return

    const targets = targetOpacitiesRef.current
    if (opacityVersionRef.current !== lodVersionRef.current) {
      currentOpacitiesRef.current.fill(1)
      opacityVersionRef.current = lodVersionRef.current
    }
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

      const camDist2D = Math.hypot(treeX - cameraOrigin.x, treeZ - cameraOrigin.z)
      if (camDist2D < TREE_CAMERA_CLEAR_RADIUS) {
        const proximityFade = 1 - MathUtils.smoothstep(camDist2D, 0.5, TREE_CAMERA_CLEAR_RADIUS)
        targets[index] = Math.min(targets[index], MathUtils.lerp(1, TREE_CAMERA_MIN_VISIBILITY, proximityFade))
      }

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

  return null
}

function InstancedTreeVariant({
  variantId,
  capacity,
  playerPositionRef,
  castShadows,
  lodLevel,
  lodPlacementsRef,
  lodVersionRef,
  parts,
  dynamicLod,
}) {
  const opacityAttributesRef = useRef([])
  const instanceUpdatersRef = useRef([])
  const registerOpacityAttribute = useCallback((index, attribute) => {
    opacityAttributesRef.current[index] = attribute
  }, [])
  const registerInstanceUpdater = useCallback((index, updater) => {
    instanceUpdatersRef.current[index] = updater
  }, [])
  const currentOpacitiesRef = useRef(new Float32Array(capacity).fill(1))
  const targetOpacitiesRef = useRef(new Float32Array(capacity).fill(1))
  const opacityVersionRef = useRef(-1)
  const runtimeEnabled = dynamicLod || Boolean(playerPositionRef)

  return (
    <>
      {runtimeEnabled && (
        <InstancedTreeRuntime
          lodPlacementsRef={lodPlacementsRef}
          lodLevel={lodLevel}
          lodVersionRef={lodVersionRef}
          playerPositionRef={playerPositionRef}
          instanceUpdatersRef={instanceUpdatersRef}
          opacityAttributesRef={opacityAttributesRef}
          currentOpacitiesRef={currentOpacitiesRef}
          targetOpacitiesRef={targetOpacitiesRef}
          opacityVersionRef={opacityVersionRef}
        />
      )}
      {parts.map((part, index) => (
        <InstancedTreePart
          key={`${variantId}-lod-${lodLevel}-${index}`}
          part={part}
          capacity={capacity}
          castShadows={castShadows}
          lodLevel={lodLevel}
          lodPlacementsRef={lodPlacementsRef}
          onOpacityAttribute={registerOpacityAttribute}
          onInstanceUpdater={registerInstanceUpdater}
          partIndex={index}
          occlusionEnabled={Boolean(playerPositionRef)}
        />
      ))}
    </>
  )
}

function getNextTreeLod(distance, previousLevel) {
  if (previousLevel === 0) return distance > TREE_LOD_THRESHOLDS[0].enter ? 1 : 0
  if (previousLevel === 1) {
    if (distance < TREE_LOD_THRESHOLDS[0].exit) return 0
    return distance > TREE_LOD_THRESHOLDS[1].enter ? 2 : 1
  }
  if (previousLevel === 2) {
    if (distance < TREE_LOD_THRESHOLDS[1].exit) return 1
    return distance > TREE_LOD_THRESHOLDS[2].enter ? 3 : 2
  }
  return distance < TREE_LOD_THRESHOLDS[2].exit ? 2 : 3
}

function TreeLodUpdater({
  placements,
  treeLevelsRef,
  lodPlacementsRef,
  lodVersionRef,
}) {
  const updateElapsedRef = useRef(0)

  useFrame(({ camera }, delta) => {
    if (placements.length === 0) return

    updateElapsedRef.current += delta
    if (updateElapsedRef.current < TREE_LOD_UPDATE_INTERVAL) return
    updateElapsedRef.current = 0

    const previousLevels = treeLevelsRef.current
    const nextLevels = new Map()
    const levels = [[], [], [], []]
    let classificationChanged = false

    placements.forEach((tree) => {
      const distance = Math.hypot(
        tree.config.position.x - camera.position.x,
        tree.config.position.z - camera.position.z,
      )
      const previousLevel = previousLevels.get(tree.id) ?? 0
      const nextLevel = getNextTreeLod(distance, previousLevel)
      nextLevels.set(tree.id, nextLevel)
      levels[nextLevel].push(tree)
      if (nextLevel !== previousLevel) classificationChanged = true
    })

    if (!classificationChanged) return

    treeLevelsRef.current = nextLevels
    lodPlacementsRef.current = levels
    lodVersionRef.current += 1
  })

  return null
}

function TreeLodVariant({
  variantId,
  placements,
  playerPositionRef,
  forceSimplified,
  castShadows,
  assetsByLod,
}) {
  const forcedLevel = forceSimplified ? 3 : 0
  const lodPlacementsRef = useRef(null)
  if (lodPlacementsRef.current === null) {
    const levels = [[], [], [], []]
    levels[forcedLevel] = placements
    lodPlacementsRef.current = levels
  }
  const lodVersionRef = useRef(0)
  const treeLevelsRef = useRef(new Map(placements.map((tree) => [tree.id, forcedLevel])))

  const lodLevels = forceSimplified ? [forcedLevel] : [0, 1, 2, 3]

  return (
    <>
      {!forceSimplified && (
        <TreeLodUpdater
          placements={placements}
          treeLevelsRef={treeLevelsRef}
          lodPlacementsRef={lodPlacementsRef}
          lodVersionRef={lodVersionRef}
        />
      )}
      {lodLevels.map((lodLevel) => (
        <InstancedTreeVariant
          key={`${variantId}-lod-${lodLevel}`}
          variantId={variantId}
          capacity={placements.length}
          playerPositionRef={lodLevel === 0 ? playerPositionRef : null}
          castShadows={castShadows && (forceSimplified || lodLevel <= 1)}
          lodLevel={lodLevel}
          lodPlacementsRef={lodPlacementsRef}
          lodVersionRef={lodVersionRef}
          parts={assetsByLod.get(lodLevel).parts}
          dynamicLod={!forceSimplified}
        />
      ))}
    </>
  )
}

function getTreeSpatialBatchKey(tree) {
  const x = tree.config.position.x
  const z = tree.config.position.z
  return `${Math.floor(x / TREE_SPATIAL_BATCH_SIZE)}:${Math.floor(z / TREE_SPATIAL_BATCH_SIZE)}`
}

function TreeWindUpdater() {
  useFrame(({ clock }) => {
    treeLeafWindUniforms.uTime.value = clock.getElapsedTime()
  })
  return null
}

function InstancedTreeBatch({
  trees,
  animated = true,
  playerPositionRef = null,
  forceSimplified = false,
  castShadows = true,
}) {
  const artDirection = useArtDirectionValues()
  const leafSurface = artDirection.surfaces.leaves
  const trunkSurface = artDirection.surfaces.trunks
  const groups = useMemo(() => {
    const next = new Map()
    trees.forEach((tree) => {
      const spatialKey = getTreeSpatialBatchKey(tree)
      const groupKey = `${tree.variantId}:${spatialKey}`
      if (!next.has(groupKey)) {
        next.set(groupKey, {
          key: groupKey,
          variantId: tree.variantId,
          placements: [],
        })
      }
      next.get(groupKey).placements.push(tree)
    })
    return [...next.values()]
  }, [trees])

  // Single useFrame for all animated variants — updates the shared uniform object once,
  // which propagates instantly to every leaf shader without re-uploading any geometry.
  // Geometry generation is expensive and the result is identical for every
  // spatial cell of a given variant/LOD. Build it once here, then let all cells
  // share the immutable geometry and material resources.
  const treeAssets = useMemo(() => {
    const assets = new Map()
    const variantIds = new Set(groups.map((group) => group.variantId))
    const lodLevels = forceSimplified ? [3] : [0, 1, 2, 3]

    variantIds.forEach((variantId) => {
      const variant = GAME_TREE_LIBRARY[variantId] ?? GAME_TREE_LIBRARY.ashMedium
      const assetsByLod = new Map()

      lodLevels.forEach((lodLevel) => {
        const treeConfig = lodLevel > 0
          ? createSimplifiedTreeConfig(variant.config, lodLevel)
          : variant.config
        const tree = createProceduralTree(treeConfig, lodLevel === 0 && animated)
        const parts = collectRenderableParts(tree).map((part) => ({
          ...part,
          occlusionMaterial: lodLevel === 0 && playerPositionRef
            ? makeOcclusionMaterial(part.material)
            : null,
        }))
        assetsByLod.set(lodLevel, { tree, parts })
      })

      assets.set(variantId, assetsByLod)
    })

    return assets
  }, [animated, forceSimplified, groups, playerPositionRef])

  useEffect(() => () => {
    treeAssets.forEach((assetsByLod) => {
      assetsByLod.forEach(({ tree, parts }) => {
        parts.forEach((part) => part.occlusionMaterial?.dispose())
        disposeTree(tree)
      })
    })
  }, [treeAssets])

  useEffect(() => {
    const leafMultiplier = getArtDirectionColorMultiplier('leaves', leafSurface.color)
    const trunkMultiplier = getArtDirectionColorMultiplier('trunks', trunkSurface.color)
    const updateMaterial = (material) => {
      if (!material) return
      const isLeaves = material.name === 'stylized-leaves'
      const [r, g, b] = isLeaves ? leafMultiplier : trunkMultiplier
      material.color?.setRGB(r, g, b)
      if (isLeaves) {
        const shader = material.userData?.shader
        if (shader?.uniforms.uArtLeafRoughness) {
          shader.uniforms.uArtLeafRoughness.value = leafSurface.roughness
        }
      } else if ('roughness' in material) {
        material.roughness = trunkSurface.roughness
      }
    }

    treeAssets.forEach((assetsByLod) => {
      assetsByLod.forEach(({ parts }) => {
        parts.forEach((part) => {
          updateMaterial(part.material)
          updateMaterial(part.occlusionMaterial)
        })
      })
    })
  }, [
    leafSurface.color,
    leafSurface.roughness,
    treeAssets,
    trunkSurface.color,
    trunkSurface.roughness,
  ])

  return (
    <group userData={{ debugCategory: 'trees' }}>
      {animated && <TreeWindUpdater />}
      {groups.map(({ key, variantId, placements }) => (
        <TreeLodVariant
          key={key}
          variantId={variantId}
          placements={placements}
          playerPositionRef={playerPositionRef}
          forceSimplified={forceSimplified}
          castShadows={castShadows}
          assetsByLod={treeAssets.get(variantId)}
        />
      ))}
    </group>
  )
}

export default InstancedTreeBatch
