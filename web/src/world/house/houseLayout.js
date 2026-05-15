const wallThickness = 0.22

const corners = [
  { id: 'main_sw', x: -5, z: -5 },
  { id: 'main_se', x: 5, z: -5 },
  { id: 'main_nw', x: -5, z: 5 },
  { id: 'main_ne', x: 5, z: 5 },
  { id: 'annex_sw', x: -3, z: 5.03 },
  { id: 'annex_se', x: 3, z: 5.03 },
  { id: 'annex_nw', x: -3, z: 9.03 },
  { id: 'annex_ne', x: 3, z: 9.03 },
]

const rooms = [
  {
    id: 'main_room',
    name: 'Piece principale',
    position: [0, 0, 0],
    size: [10, 5, 10],
    floorColor: '#b8ad9b',
    wallColor: '#e6edf6',
    exteriorColor: '#f3f0e5',
    cornerIds: ['main_sw', 'main_se', 'main_ne', 'main_nw'],
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
    cornerIds: ['annex_sw', 'annex_se', 'annex_ne', 'annex_nw'],
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
]

const wallSegments = [
  {
    id: 'wall_main_west',
    roomId: 'main_room',
    start: 'main_nw',
    end: 'main_sw',
    height: 5,
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
    start: 'main_se',
    end: 'main_ne',
    height: 5,
    sideA: { type: 'room', roomId: 'main_room', material: 'active_wall', normal: [-1, 0, 0] },
    sideB: { type: 'outside', material: 'facade_main', color: '#f3f0e5', normal: [1, 0, 0] },
    openings: [],
  },
  {
    id: 'wall_main_south',
    roomId: 'main_room',
    start: 'main_sw',
    end: 'main_se',
    height: 5,
    sideA: { type: 'room', roomId: 'main_room', material: 'active_wall', normal: [0, 0, 1] },
    sideB: { type: 'outside', material: 'facade_main', color: '#f3f0e5', normal: [0, 0, -1] },
    openings: [],
  },
  {
    id: 'wall_main_north_left',
    roomId: 'main_room',
    start: 'main_nw',
    end: 'annex_sw',
    height: 5,
    sideA: { type: 'room', roomId: 'main_room', material: 'active_wall', normal: [0, 0, -1] },
    sideB: { type: 'outside', material: 'facade_main', color: '#f3f0e5', normal: [0, 0, 1] },
    openings: [],
  },
  {
    id: 'wall_main_north_right',
    roomId: 'main_room',
    start: 'annex_se',
    end: 'main_ne',
    height: 5,
    sideA: { type: 'room', roomId: 'main_room', material: 'active_wall', normal: [0, 0, -1] },
    sideB: { type: 'outside', material: 'facade_main', color: '#f3f0e5', normal: [0, 0, 1] },
    openings: [],
  },
  {
    id: 'wall_main_north_over_second',
    roomId: 'main_room',
    start: 'annex_sw',
    end: 'annex_se',
    bottom: 3.8,
    height: 1.2,
    sideA: { type: 'room', roomId: 'main_room', material: 'active_wall', normal: [0, 0, -1] },
    sideB: { type: 'outside', material: 'facade_main', color: '#f3f0e5', normal: [0, 0, 1] },
    openings: [],
  },
  {
    id: 'wall_second_west',
    roomId: 'second_room',
    start: 'annex_sw',
    end: 'annex_nw',
    height: 3.8,
    sideA: { type: 'room', roomId: 'second_room', material: 'second_room_wall', color: '#edf1f5', normal: [1, 0, 0] },
    sideB: { type: 'outside', material: 'facade_main', color: '#f3f0e5', normal: [-1, 0, 0] },
    openings: [],
  },
  {
    id: 'wall_second_east',
    roomId: 'second_room',
    start: 'annex_ne',
    end: 'annex_se',
    height: 3.8,
    sideA: { type: 'room', roomId: 'second_room', material: 'second_room_wall', color: '#edf1f5', normal: [-1, 0, 0] },
    sideB: { type: 'outside', material: 'facade_main', color: '#f3f0e5', normal: [1, 0, 0] },
    openings: [],
  },
  {
    id: 'wall_second_north',
    roomId: 'second_room',
    start: 'annex_nw',
    end: 'annex_ne',
    height: 3.8,
    sideA: { type: 'room', roomId: 'second_room', material: 'second_room_wall', color: '#edf1f5', normal: [0, 0, -1] },
    sideB: { type: 'outside', material: 'facade_main', color: '#f3f0e5', normal: [0, 0, 1] },
    openings: [],
  },
]

const cornerById = Object.fromEntries(corners.map((corner) => [corner.id, corner]))

function normalizeWallSegment(segment) {
  const startCorner = cornerById[segment.start]
  const endCorner = cornerById[segment.end]
  if (!startCorner || !endCorner) throw new Error(`Invalid wall corners for ${segment.id}`)

  const dx = endCorner.x - startCorner.x
  const dz = endCorner.z - startCorner.z
  const length = Math.hypot(dx, dz)
  const isHorizontal = Math.abs(dx) >= Math.abs(dz)
  const alongSign = isHorizontal
    ? Math.sign(dx) || 1
    : Math.sign(dz) || 1
  const alongStart = isHorizontal ? startCorner.x : startCorner.z
  const openings = (segment.openings ?? []).map((opening) => ({
    ...opening,
    center: Number.isFinite(opening.distance)
      ? opening.distance
      : (opening.center - alongStart) * alongSign,
  }))

  return {
    ...segment,
    startCorner,
    endCorner,
    thickness: segment.thickness ?? wallThickness,
    length,
    axis: isHorizontal ? 'x' : 'z',
    constant: isHorizontal ? startCorner.z : startCorner.x,
    from: isHorizontal ? startCorner.x : startCorner.z,
    to: isHorizontal ? endCorner.x : endCorner.z,
    openings,
  }
}

export const houseLayout = {
  wallThickness,
  corners,
  rooms,
  walls: wallSegments.map(normalizeWallSegment),
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
