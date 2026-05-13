import { houseLayout, getRoomBounds, mainRoom, outsideDoorOpening, secondRoom } from './houseLayout'

const EXTERIOR_SURFACE_OFFSET = 0.08

function ExteriorSurface({ position, rotation = [0, 0, 0], width, height, color }) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial color={color} roughness={0.78} />
    </mesh>
  )
}

function RoomExterior({ room }) {
  const bounds = getRoomBounds(room)
  const width = room.size[0]
  const height = room.size[1]
  const depth = room.size[2]
  const wallY = height * 0.5
  const outsideDoor = room.id === mainRoom.id ? outsideDoorOpening : null
  const leftWallSegments = outsideDoor
    ? [
      {
        z: bounds.minZ + Math.max(0, outsideDoor.centerZ - outsideDoor.width * 0.5 - bounds.minZ) * 0.5,
        y: wallY,
        height,
        depth: Math.max(0, outsideDoor.centerZ - outsideDoor.width * 0.5 - bounds.minZ),
      },
      {
        z: outsideDoor.centerZ + outsideDoor.width * 0.5 + Math.max(0, bounds.maxZ - (outsideDoor.centerZ + outsideDoor.width * 0.5)) * 0.5,
        y: wallY,
        height,
        depth: Math.max(0, bounds.maxZ - (outsideDoor.centerZ + outsideDoor.width * 0.5)),
      },
      {
        z: outsideDoor.centerZ,
        y: outsideDoor.bottomY + outsideDoor.height + Math.max(0, height - (outsideDoor.bottomY + outsideDoor.height)) * 0.5,
        height: Math.max(0, height - (outsideDoor.bottomY + outsideDoor.height)),
        depth: outsideDoor.width,
      },
    ].filter((segment) => segment.height > 0 && segment.depth > 0)
    : [{ z: room.position[2], y: wallY, height, depth }]
  const isMainRoom = room.id === mainRoom.id
  const isSecondRoom = room.id === 'second_room'

  return (
    <group>
      {leftWallSegments.map((segment) => (
        <ExteriorSurface
          key={`${room.id}-left-${segment.z}-${segment.height}`}
          position={[bounds.minX - EXTERIOR_SURFACE_OFFSET, segment.y, segment.z]}
          rotation={[0, -Math.PI / 2, 0]}
          width={segment.depth}
          height={segment.height}
          color={room.exteriorColor}
        />
      ))}
      <ExteriorSurface
        position={[bounds.maxX + EXTERIOR_SURFACE_OFFSET, wallY, room.position[2]]}
        rotation={[0, Math.PI / 2, 0]}
        width={depth}
        height={height}
        color={room.exteriorColor}
      />
      {!isSecondRoom && (
        <ExteriorSurface
          position={[room.position[0], wallY, bounds.minZ - EXTERIOR_SURFACE_OFFSET]}
          rotation={[0, Math.PI, 0]}
          width={width}
          height={height}
          color={room.exteriorColor}
        />
      )}
      {!isMainRoom && (
        <ExteriorSurface
          position={[room.position[0], wallY, bounds.maxZ + EXTERIOR_SURFACE_OFFSET]}
          width={width}
          height={height}
          color={room.exteriorColor}
        />
      )}
    </group>
  )
}

function HouseExteriorDetails() {
  const mainBounds = getRoomBounds(mainRoom)
  const secondBounds = getRoomBounds(secondRoom)
  const doorX = mainBounds.minX - EXTERIOR_SURFACE_OFFSET - 0.01
  const doorZ = outsideDoorOpening.centerZ

  return (
    <group>
      <ExteriorSurface
        position={[doorX, 1.05, doorZ]}
        rotation={[0, -Math.PI / 2, 0]}
        width={1.18}
        height={2.1}
        color="#7d543d"
      />
      <mesh position={[doorX - 0.08, 1.16, doorZ + 0.35]}>
        <sphereGeometry args={[0.055, 12, 8]} />
        <meshStandardMaterial color="#f6d46b" emissive="#d99f35" emissiveIntensity={0.25} />
      </mesh>
      {[
        { position: [-2.55, 1.9, mainBounds.minZ - EXTERIOR_SURFACE_OFFSET - 0.01], rotation: [0, Math.PI, 0] },
        { position: [2.55, 1.9, mainBounds.minZ - EXTERIOR_SURFACE_OFFSET - 0.01], rotation: [0, Math.PI, 0] },
        { position: [-2, 1.55, secondBounds.maxZ + EXTERIOR_SURFACE_OFFSET + 0.01], rotation: [0, 0, 0] },
        { position: [2, 1.55, secondBounds.maxZ + EXTERIOR_SURFACE_OFFSET + 0.01], rotation: [0, 0, 0] },
      ].map(({ position, rotation }) => (
        <mesh key={`${position[0]}-${position[2]}`} position={position} rotation={rotation}>
          <planeGeometry args={[1.05, 0.78]} />
          <meshStandardMaterial color="#d9f5ff" emissive="#b7e8ff" emissiveIntensity={0.08} roughness={0.44} />
        </mesh>
      ))}
    </group>
  )
}

function HouseExteriorShell({ visible = true }) {
  return (
    <group visible={visible}>
      {houseLayout.rooms.map((room) => (
        <RoomExterior key={room.id} room={room} />
      ))}
      <HouseExteriorDetails />
    </group>
  )
}

export default HouseExteriorShell
