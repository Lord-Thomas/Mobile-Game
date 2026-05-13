export const houseLayout = {
  wallThickness: 0.22,
  rooms: [
    {
      id: 'main_room',
      name: 'Piece principale',
      position: [0, 0, 0],
      size: [10, 5, 10],
      floorColor: '#b8ad9b',
      wallColor: '#e6edf6',
      exteriorColor: '#f3f0e5',
      openings: [
        {
          id: 'to_second_room',
          wall: 'front',
          centerX: 0,
          bottomY: 0,
          width: 6,
          height: 3.8,
        },
        {
          id: 'to_outside',
          wall: 'left',
          centerZ: -2.25,
          bottomY: 0,
          width: 1.2,
          height: 2.4,
        },
      ],
    },
    {
      id: 'second_room',
      name: 'Deuxieme piece',
      position: [0, 0, 7.03],
      size: [6, 3.8, 4],
      floorColor: '#d4dbe3',
      wallColor: '#edf1f5',
      exteriorColor: '#edf1f5',
      openings: [
        {
          id: 'to_main_room',
          wall: 'back',
          centerX: 0,
          bottomY: 0,
          width: 6,
          height: 3.8,
        },
      ],
    },
  ],
  walls: [
    {
      id: 'wall_main_west',
      roomId: 'main_room',
      axis: 'z',
      constant: -5,
      from: -5,
      to: 5,
      height: 5,
      thickness: 0.22,
      sideA: { type: 'room', roomId: 'main_room', material: 'active_wall', normal: [1, 0, 0] },
      sideB: { type: 'outside', material: 'facade_main', color: '#f3f0e5', normal: [-1, 0, 0] },
      openings: [
        {
          id: 'to_outside',
          type: 'door',
          center: -2.25,
          width: 1.2,
          bottom: 0,
          height: 2.4,
        },
      ],
    },
    {
      id: 'wall_main_east',
      roomId: 'main_room',
      axis: 'z',
      constant: 5,
      from: -5,
      to: 5,
      height: 5,
      thickness: 0.22,
      sideA: { type: 'room', roomId: 'main_room', material: 'active_wall', normal: [-1, 0, 0] },
      sideB: { type: 'outside', material: 'facade_main', color: '#f3f0e5', normal: [1, 0, 0] },
      openings: [],
    },
    {
      id: 'wall_main_south',
      roomId: 'main_room',
      axis: 'x',
      constant: -5,
      from: -5,
      to: 5,
      height: 5,
      thickness: 0.22,
      sideA: { type: 'room', roomId: 'main_room', material: 'active_wall', normal: [0, 0, 1] },
      sideB: { type: 'outside', material: 'facade_main', color: '#f3f0e5', normal: [0, 0, -1] },
      openings: [],
    },
    {
      id: 'wall_main_north',
      roomId: 'main_room',
      axis: 'x',
      constant: 5,
      from: -5,
      to: 5,
      height: 5,
      thickness: 0.22,
      sideA: { type: 'room', roomId: 'main_room', material: 'active_wall', normal: [0, 0, -1] },
      sideB: { type: 'room', roomId: 'second_room', material: 'second_room_wall', color: '#edf1f5', normal: [0, 0, 1] },
      openings: [
        {
          id: 'to_second_room',
          type: 'door',
          center: 0,
          width: 6,
          bottom: 0,
          height: 3.8,
        },
      ],
    },
  ],
}

export const mainRoom = houseLayout.rooms.find((room) => room.id === 'main_room')
export const secondRoom = houseLayout.rooms.find((room) => room.id === 'second_room')
export const mainToSecondOpening = mainRoom.openings.find((opening) => opening.id === 'to_second_room')
export const outsideDoorOpening = mainRoom.openings.find((opening) => opening.id === 'to_outside')

export function getRoomHalfSize(room) {
  return {
    x: room.size[0] * 0.5,
    y: room.size[1] * 0.5,
    z: room.size[2] * 0.5,
  }
}

export function getRoomBounds(room) {
  const half = getRoomHalfSize(room)
  const [x, y, z] = room.position
  return {
    minX: x - half.x,
    maxX: x + half.x,
    minY: y,
    maxY: y + room.size[1],
    minZ: z - half.z,
    maxZ: z + half.z,
  }
}

export function getHouseFootprintColliders() {
  return houseLayout.rooms.map((room) => {
    const half = getRoomHalfSize(room)
    return {
      id: room.id,
      x: room.position[0],
      z: room.position[2],
      hx: half.x + houseLayout.wallThickness,
      hz: half.z + houseLayout.wallThickness,
    }
  })
}
