import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { FOREST_TREES, NEIGHBOR_HOUSES, OUTDOOR_HALF_SIZE } from './outdoorData'
import { houseLayout } from './house/houseLayout'

function OutdoorBounds({ includeHouseFootprint = true }) {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[OUTDOOR_HALF_SIZE, 0.2, OUTDOOR_HALF_SIZE]} position={[0, -0.2, 0]} />
      <CuboidCollider args={[0.45, 2.2, OUTDOOR_HALF_SIZE]} position={[-OUTDOOR_HALF_SIZE, 1.9, 0]} />
      <CuboidCollider args={[0.45, 2.2, OUTDOOR_HALF_SIZE]} position={[OUTDOOR_HALF_SIZE, 1.9, 0]} />
      <CuboidCollider args={[OUTDOOR_HALF_SIZE, 2.2, 0.45]} position={[0, 1.9, -OUTDOOR_HALF_SIZE]} />
      <CuboidCollider args={[OUTDOOR_HALF_SIZE, 2.2, 0.45]} position={[0, 1.9, OUTDOOR_HALF_SIZE]} />
      {includeHouseFootprint && houseLayout.rooms.map((room) => {
        return (
          <CuboidCollider
            key={room.id}
            args={[room.size[0] * 0.5, room.size[1] * 0.5, room.size[2] * 0.5]}
            position={[room.position[0], room.size[1] * 0.5, room.position[2]]}
          />
        )
      })}
      {NEIGHBOR_HOUSES.map((house) => (
        <CuboidCollider key={`${house.position[0]}-${house.position[2]}`} args={[2.85, 1.5, 2.35]} position={[house.position[0], 1.5, house.position[2]]} />
      ))}
      {FOREST_TREES.filter(([x, z]) => Math.abs(x) > 34 || Math.abs(z) > 34).map(([x, z, scale]) => (
        <CuboidCollider key={`tree-${x}-${z}`} args={[0.24 * scale, 0.8 * scale, 0.24 * scale]} position={[x, 0.8 * scale, z]} />
      ))}
    </RigidBody>
  )
}

export default OutdoorBounds
