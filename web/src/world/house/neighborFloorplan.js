const DEFAULT_WALL_THICKNESS = 0.18
const DOOR_WIDTH = 1.05
const DOOR_HEIGHT = 2.15

function getRoomCorners(room) {
  const [x, , z] = room.position
  const [width, , depth] = room.size
  const halfWidth = width * 0.5
  const halfDepth = depth * 0.5

  return [
    { id: `${room.id}_sw`, x: x - halfWidth, z: z - halfDepth },
    { id: `${room.id}_se`, x: x + halfWidth, z: z - halfDepth },
    { id: `${room.id}_ne`, x: x + halfWidth, z: z + halfDepth },
    { id: `${room.id}_nw`, x: x - halfWidth, z: z + halfDepth },
  ]
}

function normalizeWallSegment(segment, cornerById, wallThickness) {
  const startCorner = cornerById[segment.start]
  const endCorner = cornerById[segment.end]
  const dx = endCorner.x - startCorner.x
  const dz = endCorner.z - startCorner.z
  const length = Math.hypot(dx, dz)
  const isHorizontal = Math.abs(dx) >= Math.abs(dz)

  return {
    ...segment,
    startCorner,
    endCorner,
    thickness: wallThickness,
    length,
    axis: isHorizontal ? 'x' : 'z',
    constant: isHorizontal ? startCorner.z : startCorner.x,
    from: isHorizontal ? startCorner.x : startCorner.z,
    to: isHorizontal ? endCorner.x : endCorner.z,
  }
}

function createRoomWalls(room, color, trim) {
  const [, height] = room.size
  const corners = getRoomCorners(room)
  const [southwest, southeast, northeast, northwest] = corners
  const wallSpecs = [
    {
      id: `${room.id}_west`,
      start: northwest.id,
      end: southwest.id,
      sideA: { type: 'room', roomId: room.id, normal: [1, 0, 0], color: '#ece7df' },
      sideB: { type: 'outside', normal: [-1, 0, 0], color },
      doorSide: 'west',
    },
    {
      id: `${room.id}_east`,
      start: southeast.id,
      end: northeast.id,
      sideA: { type: 'room', roomId: room.id, normal: [-1, 0, 0], color: '#ece7df' },
      sideB: { type: 'outside', normal: [1, 0, 0], color },
      doorSide: 'east',
    },
    {
      id: `${room.id}_south`,
      start: southwest.id,
      end: southeast.id,
      sideA: { type: 'room', roomId: room.id, normal: [0, 0, 1], color: '#ece7df' },
      sideB: { type: 'outside', normal: [0, 0, -1], color },
      doorSide: 'south',
    },
    {
      id: `${room.id}_north`,
      start: northeast.id,
      end: northwest.id,
      sideA: { type: 'room', roomId: room.id, normal: [0, 0, -1], color: '#ece7df' },
      sideB: { type: 'outside', normal: [0, 0, 1], color },
      doorSide: 'north',
    },
  ]

  return {
    corners,
    walls: wallSpecs.map((wall) => ({
      ...wall,
      roomId: room.id,
      height,
      trim,
      openings: room.doorWall === wall.doorSide
        ? [{ id: `${room.id}_front_door`, type: 'door', centerRatio: 0.5, width: DOOR_WIDTH, bottom: 0, height: DOOR_HEIGHT }]
        : [],
    })),
  }
}

function getRoomBounds(room) {
  const [x, , z] = room.position
  const [width, , depth] = room.size
  return {
    minX: x - width * 0.5,
    maxX: x + width * 0.5,
    minZ: z - depth * 0.5,
    maxZ: z + depth * 0.5,
  }
}

function getWallCoverageIntervals(wall, rooms) {
  return rooms
    .filter((room) => room.id !== wall.roomId)
    .flatMap((room) => {
      const bounds = getRoomBounds(room)

      if (wall.axis === 'x') {
        const touchesWall = wall.constant >= bounds.minZ && wall.constant <= bounds.maxZ
        if (!touchesWall) return []
        const start = Math.max(Math.min(wall.from, wall.to), bounds.minX)
        const end = Math.min(Math.max(wall.from, wall.to), bounds.maxX)
        return end > start ? [[start, end]] : []
      }

      const touchesWall = wall.constant >= bounds.minX && wall.constant <= bounds.maxX
      if (!touchesWall) return []
      const start = Math.max(Math.min(wall.from, wall.to), bounds.minZ)
      const end = Math.min(Math.max(wall.from, wall.to), bounds.maxZ)
      return end > start ? [[start, end]] : []
    })
}

function subtractIntervals(start, end, blockedIntervals) {
  const sorted = blockedIntervals
    .map(([a, b]) => [Math.max(start, a), Math.min(end, b)])
    .filter(([a, b]) => b > a)
    .sort((left, right) => left[0] - right[0])

  const visible = []
  let cursor = start

  sorted.forEach(([blockedStart, blockedEnd]) => {
    if (blockedStart > cursor) visible.push([cursor, blockedStart])
    cursor = Math.max(cursor, blockedEnd)
  })

  if (cursor < end) visible.push([cursor, end])
  return visible
}

function getPointOnWall(wall, distance) {
  const t = wall.length > 0 ? distance / wall.length : 0
  return {
    x: wall.startCorner.x + (wall.endCorner.x - wall.startCorner.x) * t,
    z: wall.startCorner.z + (wall.endCorner.z - wall.startCorner.z) * t,
  }
}

function trimWallToExteriorSegments(wall, rooms) {
  const blockedIntervals = getWallCoverageIntervals(wall, rooms)
  if (!blockedIntervals.length) return [wall]

  const wallMin = Math.min(wall.from, wall.to)
  const wallMax = Math.max(wall.from, wall.to)
  const visibleIntervals = subtractIntervals(wallMin, wallMax, blockedIntervals)
  const alongSign = wall.to >= wall.from ? 1 : -1

  return visibleIntervals.map(([visibleStart, visibleEnd], index) => {
    const startDistance = alongSign > 0 ? visibleStart - wall.from : wall.from - visibleEnd
    const endDistance = alongSign > 0 ? visibleEnd - wall.from : wall.from - visibleStart
    const startCorner = getPointOnWall(wall, startDistance)
    const endCorner = getPointOnWall(wall, endDistance)

    return {
      ...wall,
      id: `${wall.id}_exterior_${index}`,
      startCorner,
      endCorner,
      length: endDistance - startDistance,
      from: wall.axis === 'x' ? startCorner.x : startCorner.z,
      to: wall.axis === 'x' ? endCorner.x : endCorner.z,
      openings: wall.openings
        .filter((opening) => opening.center >= startDistance && opening.center <= endDistance)
        .map((opening) => ({ ...opening, center: opening.center - startDistance })),
    }
  })
}

export function createNeighborFloorplan({ parts, size, doorWall, color, trim, wallThickness = DEFAULT_WALL_THICKNESS }) {
  const rooms = (parts ?? [{ id: 'main', offset: [0, 0], size, doorWall }]).map((part) => ({
    id: part.id,
    position: [part.offset?.[0] ?? 0, 0, part.offset?.[1] ?? 0],
    size: part.size,
    doorWall: part.doorWall,
  }))
  const roomGeometry = rooms.map((room) => createRoomWalls(room, color, trim))
  const corners = roomGeometry.flatMap(({ corners: roomCorners }) => roomCorners)
  const cornerById = Object.fromEntries(corners.map((corner) => [corner.id, corner]))
  const normalizedWalls = roomGeometry
    .flatMap(({ walls: roomWalls }) => roomWalls)
    .map((wall) => normalizeWallSegment(wall, cornerById, wallThickness))
    .map((wall) => ({
      ...wall,
      openings: wall.openings.map((opening) => ({
        ...opening,
        center: wall.length * opening.centerRatio,
      })),
    }))
  const walls = normalizedWalls.flatMap((wall) => trimWallToExteriorSegments(wall, rooms))

  return {
    wallThickness,
    rooms,
    corners,
    walls,
  }
}
