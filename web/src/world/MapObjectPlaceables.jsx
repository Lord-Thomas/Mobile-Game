import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Html, useAnimations, useFBX, useGLTF } from '@react-three/drei'
import { Box3, LoopRepeat, Matrix4, Mesh, Quaternion, Vector3 } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import ParticleEffect from '../effects/ParticleEffect'
import { NECRO_WEAPON_PARTICLE_NAME, useStoredParticlePreset } from '../effects/storedParticlePresets'
import InstancedTreeBatch from './trees/InstancedTreeBatch'
import ProceduralTree from './trees/ProceduralTree'
import { MAGIC_SKULL_DISCOVERY_OBJECT_ID, MAP_OBJECT_CATALOG, MAP_OBJECT_PLACEMENTS, getMapObjectCatalogItem } from './mapObjects'
import { getTerrainHeight } from './terrain/terrainGeometry'
import { getOrCreatePreparedAsset } from '../lib/assetPreparationCache'

const PLAYER_REFERENCE_HEIGHT_METERS = 1.63
const PLAYER_REFERENCE_HEIGHT_WORLD_UNITS = 2.25
const WORLD_UNITS_PER_METER = PLAYER_REFERENCE_HEIGHT_WORLD_UNITS / PLAYER_REFERENCE_HEIGHT_METERS
const STATIC_GLTF_BATCH_OBJECT_IDS = new Set(['stone_fence', 'stone_tombstone'])
const WORLD_UP = new Vector3(0, 1, 0)

function getModelFitTransform(object, catalogItem) {
  object.updateWorldMatrix(true, true)
  const box = new Box3().setFromObject(object)
  const size = box.getSize(new Vector3())
  const center = box.getCenter(new Vector3())
  const targetHeight = (catalogItem.targetHeightMeters ?? 0) * WORLD_UNITS_PER_METER
  const scale = targetHeight > 0 ? targetHeight / Math.max(size.y, 0.001) : 1

  return {
    offset: new Vector3(-center.x, -box.min.y, -center.z),
    offsetArray: [-center.x, -box.min.y, -center.z],
    scale,
  }
}

function cloneInPlaceAnimationClip(clip, fallbackName) {
  const next = clip.clone()
  next.name = next.name || fallbackName
  next.tracks = next.tracks.filter((track) => !track.name.endsWith('.position'))
  return next
}

function MapObjectGltfModel({ catalogItem }) {
  const gltf = useGLTF(catalogItem.modelUrl)
  const prepared = useMemo(() => getOrCreatePreparedAsset(
    'map-object-gltf',
    `${catalogItem.modelUrl}:${catalogItem.targetHeightMeters ?? 0}`,
    () => {
      const object = clone(gltf.scene)

      object.traverse((child) => {
        if (child instanceof Mesh) {
          child.castShadow = true
          child.receiveShadow = true
        }
      })

      const transform = getModelFitTransform(object, catalogItem)
      return {
        template: object,
        offset: transform.offsetArray,
        scale: transform.scale,
      }
    },
  ), [catalogItem, gltf.scene])
  const model = useMemo(() => ({
    ...prepared,
    object: clone(prepared.template),
  }), [prepared])

  return (
    <group scale={model.scale}>
      <primitive object={model.object} position={model.offset} />
    </group>
  )
}

function MapObjectFbxModel({ catalogItem }) {
  const fbx = useFBX(catalogItem.modelUrl)
  const prepared = useMemo(() => getOrCreatePreparedAsset(
    'map-object-fbx',
    `${catalogItem.modelUrl}:${catalogItem.targetHeightMeters ?? 0}`,
    () => {
      const object = clone(fbx)

      object.traverse((child) => {
        if (child instanceof Mesh) {
          child.castShadow = true
          child.receiveShadow = true
        }
      })

      const transform = getModelFitTransform(object, catalogItem)
      return {
        template: object,
        offset: transform.offsetArray,
        scale: transform.scale,
      }
    },
  ), [catalogItem, fbx])
  const model = useMemo(() => ({
    ...prepared,
    object: clone(prepared.template),
  }), [prepared])
  const animationClips = useMemo(
    () => (fbx.animations ?? []).map((clip, index) => {
      return cloneInPlaceAnimationClip(clip, `fbxIdle${index}`)
    }),
    [fbx.animations],
  )
  const { actions, mixer } = useAnimations(animationClips, model.object)

  useLayoutEffect(() => {
    const action = actions.idle ?? actions.Idle ?? Object.values(actions)[0]
    if (!action) return undefined

    action
      .reset()
      .setLoop(LoopRepeat, Infinity)
      .setEffectiveWeight(1)
      .setEffectiveTimeScale(1)
      .play()
    mixer.update(1 / 30)
    model.object.updateMatrixWorld(true)

    return () => action.stop()
  }, [actions, mixer, model.object])

  return (
    <group scale={model.scale}>
      <primitive object={model.object} position={model.offset} />
    </group>
  )
}

function getModelExtension(modelUrl = '') {
  return modelUrl.split('?')[0].split('.').pop()?.toLowerCase() ?? ''
}

const mapObjectAssetPromises = new Map()

function waitForIdleTurn() {
  if (typeof window === 'undefined') return Promise.resolve()
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: 800 })
    } else {
      window.setTimeout(resolve, 16)
    }
  })
}

function preloadMapObjectAssets(objects = MAP_OBJECT_PLACEMENTS) {
  const uniqueItems = []
  const seenUrls = new Set()
  objects.forEach((placement) => {
    const item = MAP_OBJECT_CATALOG[placement.objectId]
    if (!item?.modelUrl || seenUrls.has(item.modelUrl)) return
    seenUrls.add(item.modelUrl)
    uniqueItems.push(item)
  })

  let nextIndex = 0
  const runWorker = async () => {
    while (nextIndex < uniqueItems.length) {
      const item = uniqueItems[nextIndex]
      nextIndex += 1
      if (!mapObjectAssetPromises.has(item.modelUrl)) {
        await waitForIdleTurn()
        const preload = getModelExtension(item.modelUrl) === 'fbx'
          ? () => useFBX.preload(item.modelUrl)
          : () => useGLTF.preload(item.modelUrl)
        mapObjectAssetPromises.set(
          item.modelUrl,
          Promise.resolve().then(preload).catch(() => null),
        )
      }
      await mapObjectAssetPromises.get(item.modelUrl)
    }
  }

  const workerCount = Math.min(2, uniqueItems.length)
  return Promise.all(Array.from({ length: workerCount }, runWorker))
}

export function MapObjectAssetsPreloader({
  objects = MAP_OBJECT_PLACEMENTS,
  onReady = null,
}) {
  useEffect(() => {
    let cancelled = false
    preloadMapObjectAssets(objects).finally(() => {
      if (!cancelled) onReady?.()
    })
    return () => { cancelled = true }
  }, [objects, onReady])
  return null
}

function MapObjectTreeModel({ catalogItem }) {
  // Memoize the config object: ProceduralTree rebuilds its whole geometry when
  // the config reference changes, so a fresh literal each render would rebuild
  // the tree on every re-render (every editor action). Keyed on the catalog
  // entry, which is stable, the tree is built once.
  const config = useMemo(() => ({
    ...catalogItem.treeConfig,
    position: { x: 0, y: catalogItem.treeConfig.position?.y ?? 0, z: 0 },
    rotationY: 0,
    snapToGround: false,
  }), [catalogItem])

  return <ProceduralTree animated={false} config={config} />
}

function getMapObjectTreeBatchEntry(placement, catalogItem) {
  if (catalogItem?.type !== 'tree' || !catalogItem.treeId || !catalogItem.treeConfig) return null

  const [x, savedY, z] = placement.position ?? [0, 0, 0]
  const basePosition = catalogItem.treeConfig.position ?? {}
  const hasSavedY = Number.isFinite(savedY)
  const placementScale = Number.isFinite(placement.scale)
    ? placement.scale
    : catalogItem.defaultScale ?? 1
  const baseScale = Number.isFinite(catalogItem.treeConfig.scale)
    ? catalogItem.treeConfig.scale
    : 1

  return {
    id: placement.id,
    variantId: catalogItem.treeId,
    config: {
      ...catalogItem.treeConfig,
      position: {
        x,
        y: hasSavedY ? savedY + (basePosition.y ?? 0) : basePosition.y ?? 0,
        z,
      },
      rotationY: (catalogItem.treeConfig.rotationY ?? 0) + (placement.rotationY ?? 0),
      scale: baseScale * placementScale,
      snapToGround: !hasSavedY,
    },
  }
}

function getMaterialKey(material) {
  if (Array.isArray(material)) return material.map((entry) => entry?.uuid ?? 'material').join(':')
  return material?.uuid ?? 'material'
}

function getStaticGltfMeshParts(scene) {
  const previousPosition = scene.position.clone()
  scene.position.set(0, 0, 0)
  scene.updateWorldMatrix(true, true)
  const parts = []

  scene.traverse((child) => {
    if (!(child instanceof Mesh)) return
    if (child.isSkinnedMesh || !child.geometry || !child.material) return
    parts.push({
      key: `${child.uuid}:${child.geometry.uuid}:${getMaterialKey(child.material)}`,
      geometry: child.geometry,
      material: child.material,
      matrix: child.matrixWorld.clone(),
    })
  })

  scene.position.copy(previousPosition)
  scene.updateWorldMatrix(true, true)
  return parts
}

function canBatchStaticGltfObject(placement, catalogItem, objectCounts) {
  return (
    STATIC_GLTF_BATCH_OBJECT_IDS.has(placement.objectId) &&
    objectCounts.get(placement.objectId) > 1 &&
    getModelExtension(catalogItem?.modelUrl) === 'glb'
  )
}

function splitStaticPlacements(objects, enabled) {
  if (!enabled) return { treeEntries: [], instancedModelGroups: [], objectPlacements: objects }

  const treeEntries = []
  const instancedModelGroupMap = new Map()
  const objectPlacements = []
  const objectCounts = objects.reduce((counts, placement) => {
    counts.set(placement.objectId, (counts.get(placement.objectId) ?? 0) + 1)
    return counts
  }, new Map())

  objects.forEach((placement) => {
    const catalogItem = getMapObjectCatalogItem(placement.objectId)
    const treeEntry = getMapObjectTreeBatchEntry(placement, catalogItem)
    if (treeEntry) {
      treeEntries.push(treeEntry)
    } else if (canBatchStaticGltfObject(placement, catalogItem, objectCounts)) {
      const group = instancedModelGroupMap.get(placement.objectId) ?? {
        objectId: placement.objectId,
        placements: [],
      }
      group.placements.push(placement)
      instancedModelGroupMap.set(placement.objectId, group)
    } else {
      objectPlacements.push(placement)
    }
  })

  return {
    treeEntries,
    instancedModelGroups: Array.from(instancedModelGroupMap.values()),
    objectPlacements,
  }
}

function StaticGltfModelBatchPart({ meshPart, placements, modelTransform }) {
  const meshRef = useRef()

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const position = new Vector3()
    const rotation = new Quaternion()
    const scale = new Vector3()
    const placementMatrix = new Matrix4()
    const offsetMatrix = new Matrix4().makeTranslation(
      modelTransform.offset.x,
      modelTransform.offset.y,
      modelTransform.offset.z,
    )

    placements.forEach((placement, index) => {
      const [x, savedY, z] = placement.position ?? [0, 0, 0]
      const y = Number.isFinite(savedY) ? savedY : getTerrainHeight(x, z)
      const placementScale = Number.isFinite(placement.scale) ? placement.scale : 1
      const totalScale = placementScale * modelTransform.scale
      position.set(x, y, z)
      rotation.setFromAxisAngle(WORLD_UP, placement.rotationY ?? 0)
      scale.set(totalScale, totalScale, totalScale)
      placementMatrix.compose(position, rotation, scale)
      placementMatrix.multiply(offsetMatrix)
      placementMatrix.multiply(meshPart.matrix)
      mesh.setMatrixAt(index, placementMatrix)
    })

    mesh.count = placements.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [meshPart.matrix, modelTransform.offset, modelTransform.scale, placements])

  return (
    <instancedMesh
      ref={meshRef}
      args={[meshPart.geometry, meshPart.material, placements.length]}
      castShadow
      receiveShadow
      userData={{ debugCategory: 'map-placeables-instanced' }}
    />
  )
}

function StaticGltfModelBatch({ objectId, placements }) {
  const catalogItem = getMapObjectCatalogItem(objectId)
  const gltf = useGLTF(catalogItem.modelUrl)
  const modelTransform = useMemo(
    () => getModelFitTransform(gltf.scene, catalogItem),
    [catalogItem, gltf.scene],
  )
  const meshParts = useMemo(
    () => getStaticGltfMeshParts(gltf.scene),
    [gltf.scene],
  )

  if (!meshParts.length) return null

  return (
    <group userData={{ debugCategory: 'map-placeables-instanced', mapObjectId: objectId }}>
      {meshParts.map((meshPart) => (
        <StaticGltfModelBatchPart
          key={meshPart.key}
          meshPart={meshPart}
          placements={placements}
          modelTransform={modelTransform}
        />
      ))}
    </group>
  )
}

function MapObjectModel({ objectId }) {
  const catalogItem = getMapObjectCatalogItem(objectId)
  if (objectId === MAGIC_SKULL_DISCOVERY_OBJECT_ID) return <MagicSkullDiscoveryMapModel catalogItem={catalogItem} />
  if (catalogItem?.type === 'tree') return <MapObjectTreeModel catalogItem={catalogItem} />
  if (getModelExtension(catalogItem?.modelUrl) === 'fbx') return <MapObjectFbxModel catalogItem={catalogItem} />
  return <MapObjectGltfModel catalogItem={catalogItem} />
}

function MagicSkullDiscoveryMapModel({ catalogItem }) {
  const { scene } = useGLTF(catalogItem.modelUrl)
  const necroParticlePreset = useStoredParticlePreset(NECRO_WEAPON_PARTICLE_NAME)
  const skullScene = useMemo(() => {
    const next = clone(scene)
    next.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true
        child.receiveShadow = true
        child.frustumCulled = false
      }
    })
    return next
  }, [scene])
  const fitScale = useMemo(() => {
    const box = new Box3().setFromObject(skullScene)
    const size = box.getSize(new Vector3())
    const targetHeight = (catalogItem.targetHeightMeters ?? 0.15) * WORLD_UNITS_PER_METER
    return targetHeight / Math.max(size.x, size.y, size.z, 0.001)
  }, [catalogItem.targetHeightMeters, skullScene])

  return (
    <group>
      <primitive object={skullScene} scale={fitScale} />
      {necroParticlePreset && (
        <ParticleEffect
          preset={necroParticlePreset}
          playing
          loop
        />
      )}
      <pointLight color="#8b5cf6" intensity={1.1} distance={3.2} decay={2} />
    </group>
  )
}

function MapObjectSelection({ placement, color = '#9fe0bc' }) {
  const catalogItem = getMapObjectCatalogItem(placement.objectId)
  const radius = catalogItem?.selectionRadius ?? 1.4
  const height = catalogItem?.heightWorldUnits
    ?? (catalogItem?.targetHeightMeters ?? 3) * WORLD_UNITS_PER_METER
  const label = catalogItem?.name ?? placement.objectId

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
        <ringGeometry args={[radius, radius + 0.16, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} depthWrite={false} />
      </mesh>
      <mesh position={[0, height * 0.5, 0]}>
        <cylinderGeometry args={[radius, radius, height, 32, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.18} wireframe depthWrite={false} />
      </mesh>
      <mesh position={[0, height + 0.35, 0]}>
        <sphereGeometry args={[0.28, 18, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} depthWrite={false} />
      </mesh>
      <Html position={[0, height + 0.9, 0]} center transform sprite distanceFactor={12}>
        <div style={{
          padding: '5px 8px',
          borderRadius: 6,
          color: '#0e1814',
          background: color,
          font: '700 11px system-ui, sans-serif',
          whiteSpace: 'nowrap',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.24)',
        }}>
          {label}
        </div>
      </Html>
    </>
  )
}

function MapObjectHitTarget({ placement, onPointerDown, onPointerMove, onPointerUp }) {
  const catalogItem = getMapObjectCatalogItem(placement.objectId)
  const radius = catalogItem?.hitRadius ?? catalogItem?.selectionRadius ?? 1.5
  const height = catalogItem?.hitHeightWorldUnits
    ?? (catalogItem?.hitHeightMeters ?? catalogItem?.targetHeightMeters ?? 3) * WORLD_UNITS_PER_METER

  return (
    <mesh
      position={[0, height * 0.5, 0]}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      userData={{ debugCategory: 'map-placeable-hit-target', mapObjectId: placement.id }}
    >
      <cylinderGeometry args={[radius, radius, height, 24]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

export function MapObjectInstance({
  placement,
  selected = false,
  ghost = false,
  onPointerDown = null,
  onPointerMove = null,
  onPointerUp = null,
  onRegister = null,
}) {
  const [x, savedY, z] = placement.position ?? [0, 0, 0]
  const terrainY = getTerrainHeight(x, z)
  const y = Number.isFinite(savedY) ? savedY : terrainY
  const groupRef = useRef()

  // Expose the group so the editor can drag it imperatively (mutating
  // group.position) without a React re-render per pointermove.
  useEffect(() => {
    if (!onRegister) return undefined
    onRegister(placement.id, groupRef.current)
    return () => onRegister(placement.id, null)
  }, [onRegister, placement.id])

  return (
    <group
      ref={groupRef}
      position={[x, y, z]}
      rotation={[0, placement.rotationY ?? 0, 0]}
      scale={placement.scale ?? 1}
      onPointerDown={onPointerDown}
      userData={{ debugCategory: 'map-placeables', mapObjectId: placement.id }}
    >
      <Suspense fallback={null}>
        <MapObjectModel objectId={placement.objectId} />
      </Suspense>
      {onPointerDown && (
        <MapObjectHitTarget
          placement={placement}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      )}
      {(selected || ghost) && (
        <MapObjectSelection placement={placement} color={ghost ? '#ffd447' : '#9fe0bc'} />
      )}
    </group>
  )
}

export default function MapObjectPlaceables({
  objects = MAP_OBJECT_PLACEMENTS,
  selectedId = null,
  onSelect = null,
  onStartDragging = null,
  registerRef = null,
  batchStaticTrees = false,
  showTrees = true,
}) {
  useEffect(() => {
    preloadMapObjectAssets(objects)
  }, [objects])

  const canBatchStaticObjects = batchStaticTrees && !onSelect && !onStartDragging && !registerRef
  const visibleObjects = useMemo(
    () => showTrees
      ? objects
      : objects.filter((placement) => getMapObjectCatalogItem(placement.objectId)?.type !== 'tree'),
    [objects, showTrees],
  )
  const { treeEntries, instancedModelGroups, objectPlacements } = useMemo(
    () => splitStaticPlacements(visibleObjects, canBatchStaticObjects),
    [canBatchStaticObjects, visibleObjects],
  )

  return (
    <group userData={{ debugCategory: 'map-placeables' }}>
      {treeEntries.length > 0 && (
        <InstancedTreeBatch trees={treeEntries} animated={false} forceSimplified />
      )}
      {instancedModelGroups.map((group) => (
        <Suspense key={group.objectId} fallback={null}>
          <StaticGltfModelBatch objectId={group.objectId} placements={group.placements} />
        </Suspense>
      ))}
      {objectPlacements.map((placement) => (
        <MapObjectInstance
          key={placement.id}
          placement={placement}
          selected={selectedId === placement.id}
          onRegister={registerRef}
          // Press = select + start dragging, just like the in-game
          // EditableObject. Crucially no pointer capture and no move/up
          // handler here, so pointer-move events fall through to the ground
          // plane which makes the object follow the cursor.
          onPointerDown={onSelect ? (event) => {
            // Left button only: right/middle stay free for the camera.
            if (event.button !== 0) return
            event.stopPropagation()
            onSelect(placement.id)
            onStartDragging?.(placement.id, event)
          } : null}
        />
      ))}
    </group>
  )
}
