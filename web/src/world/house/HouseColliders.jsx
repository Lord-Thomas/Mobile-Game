import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { getRoomBounds, houseLayout } from './houseLayout'

function HouseColliders({ includeFloor = true, includeWalls = true }) {
  const thickness = houseLayout.wallThickness

  return (
    <RigidBody type="fixed" colliders={false}>
      {houseLayout.rooms.map((room) => {
        const bounds = getRoomBounds(room)
        const [x, , z] = room.position
        const [width, height, depth] = room.size
        const halfY = height * 0.5

        return (
          <group key={room.id}>
            {includeFloor && (
              <CuboidCollider args={[width * 0.5, 0.2, depth * 0.5]} position={[x, -0.2, z]} />
            )}
            {includeWalls && (
              <>
                <CuboidCollider args={[thickness, halfY, depth * 0.5]} position={[bounds.minX, halfY, z]} />
                <CuboidCollider args={[thickness, halfY, depth * 0.5]} position={[bounds.maxX, halfY, z]} />
                <CuboidCollider args={[width * 0.5, halfY, thickness]} position={[x, halfY, bounds.minZ]} />
                <CuboidCollider args={[width * 0.5, halfY, thickness]} position={[x, halfY, bounds.maxZ]} />
              </>
            )}
          </group>
        )
      })}
    </RigidBody>
  )
}

export default HouseColliders
