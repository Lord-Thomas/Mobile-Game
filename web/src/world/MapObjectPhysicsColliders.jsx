import { useMemo } from 'react'
import { RigidBody, TrimeshCollider } from '@react-three/rapier'
import { MAP_OBJECT_PLACEMENTS } from './mapObjects'
import { getMapObjectBaseY, getMapObjectCollisionData } from './mapObjectCollision'

function getScaledVertices(vertices, scale) {
  if (!Number.isFinite(scale) || Math.abs(scale - 1) < 0.0001) return vertices

  const scaled = new Float32Array(vertices.length)
  for (let index = 0; index < vertices.length; index += 1) {
    scaled[index] = vertices[index] * scale
  }
  return scaled
}

function MapObjectPhysicsCollider({ placement }) {
  const data = getMapObjectCollisionData(placement.objectId)
  const placementScale = placement.scale ?? 1
  const vertices = useMemo(
    () => (data ? getScaledVertices(data.vertices, placementScale) : null),
    [data, placementScale],
  )
  if (!data) return null

  const [x = 0, , z = 0] = placement.position ?? []
  const y = getMapObjectBaseY(placement)

  return (
    <RigidBody
      type="fixed"
      colliders={false}
      position={[x, y, z]}
      rotation={[0, placement.rotationY ?? 0, 0]}
    >
      <TrimeshCollider args={[vertices, data.indices]} />
    </RigidBody>
  )
}

export default function MapObjectPhysicsColliders({ objects = MAP_OBJECT_PLACEMENTS }) {
  return (
    <>
      {objects.map((placement) => {
        const [x = 0, y = 0, z = 0] = placement.position ?? []
        const key = [
          placement.id,
          x.toFixed(3),
          y.toFixed(3),
          z.toFixed(3),
          (placement.rotationY ?? 0).toFixed(4),
          (placement.scale ?? 1).toFixed(3),
        ].join(':')
        return <MapObjectPhysicsCollider key={key} placement={placement} />
      })}
    </>
  )
}
