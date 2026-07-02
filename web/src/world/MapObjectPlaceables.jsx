import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Html, useAnimations, useFBX, useGLTF } from '@react-three/drei'
import { Box3, LoopRepeat, Mesh, Vector3 } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import ParticleEffect from '../effects/ParticleEffect'
import { NECRO_WEAPON_PARTICLE_NAME, useStoredParticlePreset } from '../effects/storedParticlePresets'
import InstancedTreeBatch from './trees/InstancedTreeBatch'
import ProceduralTree from './trees/ProceduralTree'
import { MAGIC_SKULL_DISCOVERY_OBJECT_ID, MAP_OBJECT_CATALOG, MAP_OBJECT_PLACEMENTS, getMapObjectCatalogItem } from './mapObjects'
import { getTerrainHeight } from './terrain/terrainGeometry'

const PLAYER_REFERENCE_HEIGHT_METERS = 1.63
const PLAYER_REFERENCE_HEIGHT_WORLD_UNITS = 2.25
const WORLD_UNITS_PER_METER = PLAYER_REFERENCE_HEIGHT_WORLD_UNITS / PLAYER_REFERENCE_HEIGHT_METERS

function cloneInPlaceAnimationClip(clip, fallbackName) {
  const next = clip.clone()
  next.name = next.name || fallbackName
  next.tracks = next.tracks.filter((track) => !track.name.endsWith('.position'))
  return next
}

function MapObjectGltfModel({ catalogItem }) {
  const gltf = useGLTF(catalogItem.modelUrl)
  const model = useMemo(() => {
    const object = clone(gltf.scene)

    object.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    object.updateWorldMatrix(true, true)
    const box = new Box3().setFromObject(object)
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    const targetHeight = (catalogItem.targetHeightMeters ?? 0) * WORLD_UNITS_PER_METER
    const scale = targetHeight > 0 ? targetHeight / Math.max(size.y, 0.001) : 1

    return {
      object,
      offset: [-center.x, -box.min.y, -center.z],
      scale,
    }
  }, [catalogItem.targetHeightMeters, gltf.scene])

  return (
    <group scale={model.scale}>
      <primitive object={model.object} position={model.offset} />
    </group>
  )
}

function MapObjectFbxModel({ catalogItem }) {
  const fbx = useFBX(catalogItem.modelUrl)
  const model = useMemo(() => {
    const object = clone(fbx)

    object.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    object.updateWorldMatrix(true, true)
    const box = new Box3().setFromObject(object)
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    const targetHeight = (catalogItem.targetHeightMeters ?? 0) * WORLD_UNITS_PER_METER
    const scale = targetHeight > 0 ? targetHeight / Math.max(size.y, 0.001) : 1

    return {
      object,
      offset: [-center.x, -box.min.y, -center.z],
      scale,
    }
  }, [catalogItem.targetHeightMeters, fbx])
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

function preloadMapObjectAssets(objects = MAP_OBJECT_PLACEMENTS) {
  objects.forEach((placement) => {
    const item = MAP_OBJECT_CATALOG[placement.objectId]
    if (!item?.modelUrl) return
    if (getModelExtension(item.modelUrl) === 'fbx') useFBX.preload(item.modelUrl)
    else useGLTF.preload(item.modelUrl)
  })
}

export function MapObjectAssetsPreloader({ objects = MAP_OBJECT_PLACEMENTS }) {
  useEffect(() => {
    preloadMapObjectAssets(objects)
  }, [objects])
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

function splitStaticTreePlacements(objects, enabled) {
  if (!enabled) return { treeEntries: [], objectPlacements: objects }

  const treeEntries = []
  const objectPlacements = []
  objects.forEach((placement) => {
    const catalogItem = getMapObjectCatalogItem(placement.objectId)
    const treeEntry = getMapObjectTreeBatchEntry(placement, catalogItem)
    if (treeEntry) {
      treeEntries.push(treeEntry)
    } else {
      objectPlacements.push(placement)
    }
  })

  return { treeEntries, objectPlacements }
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
}) {
  useEffect(() => {
    preloadMapObjectAssets(objects)
  }, [objects])

  const canBatchStaticTrees = batchStaticTrees && !onSelect && !onStartDragging && !registerRef
  const { treeEntries, objectPlacements } = useMemo(
    () => splitStaticTreePlacements(objects, canBatchStaticTrees),
    [canBatchStaticTrees, objects],
  )

  return (
    <group userData={{ debugCategory: 'map-placeables' }}>
      {treeEntries.length > 0 && (
        <InstancedTreeBatch trees={treeEntries} animated={false} forceSimplified />
      )}
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
