import { RigidBody, TrimeshCollider } from '@react-three/rapier'
import { MAP_OBJECT_PLACEMENTS } from './mapObjects'
import { getMapObjectBaseY, getMapObjectCollisionData } from './mapObjectCollision'

function MapObjectPhysicsCollider({ placement }) {
  const data = getMapObjectCollisionData(placement.objectId)
  if (!data) return null

  const [x = 0, , z = 0] = placement.position ?? []
  const y = getMapObjectBaseY(placement)

  return (
    <RigidBody
      type="fixed"
      colliders={false}
      position={[x, y, z]}
      rotation={[0, placement.rotationY ?? 0, 0]}
      scale={placement.scale ?? 1}
    >
      <TrimeshCollider args={[data.vertices, data.indices]} />
    </RigidBody>
  )
}

export default function MapObjectPhysicsColliders({ objects = MAP_OBJECT_PLACEMENTS }) {
  return (
    <>
      {objects.map((placement) => (
        <MapObjectPhysicsCollider key={placement.id} placement={placement} />
      ))}
    </>
  )
}
