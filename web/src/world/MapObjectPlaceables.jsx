import { Suspense, useMemo } from 'react'
import { Html, useGLTF } from '@react-three/drei'
import { Box3, Mesh, Vector3 } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { MAP_OBJECT_CATALOG, MAP_OBJECT_PLACEMENTS } from './mapObjects'
import { getTerrainHeight } from './terrain/terrainGeometry'

const PLAYER_REFERENCE_HEIGHT_METERS = 1.63
const PLAYER_REFERENCE_HEIGHT_WORLD_UNITS = 2.25
const WORLD_UNITS_PER_METER = PLAYER_REFERENCE_HEIGHT_WORLD_UNITS / PLAYER_REFERENCE_HEIGHT_METERS

function MapObjectModel({ objectId }) {
  const catalogItem = MAP_OBJECT_CATALOG[objectId]
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

function MapObjectSelection({ placement, color = '#9fe0bc' }) {
  const catalogItem = MAP_OBJECT_CATALOG[placement.objectId]
  const radius = catalogItem?.selectionRadius ?? 1.4
  const height = (catalogItem?.targetHeightMeters ?? 3) * WORLD_UNITS_PER_METER
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
  const catalogItem = MAP_OBJECT_CATALOG[placement.objectId]
  const radius = catalogItem?.hitRadius ?? catalogItem?.selectionRadius ?? 1.5
  const height = (catalogItem?.hitHeightMeters ?? catalogItem?.targetHeightMeters ?? 3) * WORLD_UNITS_PER_METER

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
}) {
  const [x, savedY, z] = placement.position ?? [0, 0, 0]
  const terrainY = getTerrainHeight(x, z)
  const y = Number.isFinite(savedY) ? Math.max(savedY, terrainY) : terrainY

  return (
    <group
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
  onBeginMove = null,
  canStartDragging = null,
  canBeginMove = null,
  onDragPointerMove = null,
  onDragPointerUp = null,
}) {
  return (
    <group userData={{ debugCategory: 'map-placeables' }}>
      {objects.map((placement) => (
        <MapObjectInstance
          key={placement.id}
          placement={placement}
          selected={selectedId === placement.id}
          onPointerDown={onSelect ? (event) => {
            event.stopPropagation()
            event.target?.setPointerCapture?.(event.pointerId)
            onSelect(placement.id)
            if (canStartDragging?.(placement)) {
              onStartDragging?.(placement.id)
              return
            }
            if (!canBeginMove || canBeginMove(placement)) {
              onBeginMove?.(placement.id)
              onStartDragging?.(placement.id)
            }
          } : null}
          onPointerMove={onDragPointerMove ? (event) => {
            onDragPointerMove(placement.id, event)
          } : null}
          onPointerUp={onDragPointerUp ? (event) => {
            event.stopPropagation()
            event.target?.releasePointerCapture?.(event.pointerId)
            onDragPointerUp(placement.id, event)
          } : null}
        />
      ))}
    </group>
  )
}

Object.values(MAP_OBJECT_CATALOG).forEach((item) => {
  if (item.modelUrl) useGLTF.preload(item.modelUrl)
})
