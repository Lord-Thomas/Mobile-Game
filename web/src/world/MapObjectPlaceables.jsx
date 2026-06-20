import { Suspense, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
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

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
      <ringGeometry args={[radius, radius + 0.12, 48]} />
      <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
    </mesh>
  )
}

export function MapObjectInstance({
  placement,
  selected = false,
  ghost = false,
  onPointerDown = null,
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
            onSelect(placement.id)
            onStartDragging?.(placement.id)
          } : null}
        />
      ))}
    </group>
  )
}

Object.values(MAP_OBJECT_CATALOG).forEach((item) => {
  if (item.modelUrl) useGLTF.preload(item.modelUrl)
})
