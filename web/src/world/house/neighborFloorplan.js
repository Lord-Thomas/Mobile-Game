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

function getExteriorContour(rooms) {
  const xs = [...new Set(rooms.flatMap((room) => {
    const bounds = getRoomBounds(room)
    return [bounds.minX, bounds.maxX]
  }))].sort((a, b) => a - b)
  const zs = [...new Set(rooms.flatMap((room) => {
    const bounds = getRoomBounds(room)
    return [bounds.minZ, bounds.maxZ]
  }))].sort((a, b) => a - b)
  const occupied = []

  for (let zi = 0; zi < zs.length - 1; zi += 1) {
    for (let xi = 0; xi < xs.length - 1; xi += 1) {
      const centerX = (xs[xi] + xs[xi + 1]) * 0.5
      const centerZ = (zs[zi] + zs[zi + 1]) * 0.5
      const isOccupied = rooms.some((room) => {
        const bounds = getRoomBounds(room)
        return centerX > bounds.minX && centerX < bounds.maxX && centerZ > bounds.minZ && centerZ < bounds.maxZ
      })
      if (isOccupied) occupied.push({ xi, zi })
    }
  }

  return {
    xs,
    zs,
    occupied,
  }
}

function roomsTouch(left, right) {
  const a = getRoomBounds(left)
  const b = getRoomBounds(right)
  const touchX = Math.abs(a.maxX - b.minX) < 0.001 || Math.abs(b.maxX - a.minX) < 0.001
  const overlapZ = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > 0.001
  const touchZ = Math.abs(a.maxZ - b.minZ) < 0.001 || Math.abs(b.maxZ - a.minZ) < 0.001
  const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > 0.001
  return (touchX && overlapZ) || (touchZ && overlapX)
}

function getGroupBounds(groupRooms) {
  return groupRooms.reduce((bounds, room) => {
    const roomBounds = getRoomBounds(room)
    return {
      minX: Math.min(bounds.minX, roomBounds.minX),
      maxX: Math.max(bounds.maxX, roomBounds.maxX),
      minZ: Math.min(bounds.minZ, roomBounds.minZ),
      maxZ: Math.max(bounds.maxZ, roomBounds.maxZ),
    }
  }, {
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  })
}

function getRoofGroups(rooms) {
  const pending = new Set(rooms.map((room) => room.id))
  const groups = []

  while (pending.size) {
    const seedId = pending.values().next().value
    const seed = rooms.find((room) => room.id === seedId)
    const queue = [seed]
    const groupRooms = []
    pending.delete(seedId)

    while (queue.length) {
      const room = queue.shift()
      groupRooms.push(room)
      rooms.forEach((candidate) => {
        if (
          pending.has(candidate.id) &&
          candidate.size[1] === room.size[1] &&
          roomsTouch(room, candidate)
        ) {
          pending.delete(candidate.id)
          queue.push(candidate)
        }
      })
    }

    const bounds = getGroupBounds(groupRooms)
    groups.push({
      id: groupRooms.map((room) => room.id).join('__'),
      roomIds: groupRooms.map((room) => room.id),
      height: groupRooms[0].size[1],
      center: [(bounds.minX + bounds.maxX) * 0.5, 0, (bounds.minZ + bounds.maxZ) * 0.5],
      width: bounds.maxX - bounds.minX,
      depth: bounds.maxZ - bounds.minZ,
    })
  }

  return groups.sort((left, right) => right.height - left.height)
}

function getAttachmentSide(group, primaryGroup) {
  const a = {
    minX: group.center[0] - group.width * 0.5,
    maxX: group.center[0] + group.width * 0.5,
    minZ: group.center[2] - group.depth * 0.5,
    maxZ: group.center[2] + group.depth * 0.5,
  }
  const b = {
    minX: primaryGroup.center[0] - primaryGroup.width * 0.5,
    maxX: primaryGroup.center[0] + primaryGroup.width * 0.5,
    minZ: primaryGroup.center[2] - primaryGroup.depth * 0.5,
    maxZ: primaryGroup.center[2] + primaryGroup.depth * 0.5,
  }
  if (Math.abs(a.minX - b.maxX) < 0.001) return 'west'
  if (Math.abs(a.maxX - b.minX) < 0.001) return 'east'
  if (Math.abs(a.minZ - b.maxZ) < 0.001) return 'south'
  if (Math.abs(a.maxZ - b.minZ) < 0.001) return 'north'
  return null
}

export function createNeighborFloorplan({ parts, size, doorWall, color, trim, wallThickness = DEFAULT_WALL_THICKNESS }) {
  const rooms = (parts ?? [{ id: 'main', offset: [0, 0], size, doorWall }]).map((part) => ({
    id: part.id,
    position: [part.offset?.[0] ?? 0, 0, part.offset?.[1] ?? 0],
    size: part.size,
    doorWall: part.doorWall,
    roofType: part.roofType,
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
  const buildingBounds = rooms.reduce((bounds, room) => {
    const roomBounds = getRoomBounds(room)
    return {
      minX: Math.min(bounds.minX, roomBounds.minX),
      maxX: Math.max(bounds.maxX, roomBounds.maxX),
      minZ: Math.min(bounds.minZ, roomBounds.minZ),
      maxZ: Math.max(bounds.maxZ, roomBounds.maxZ),
    }
  }, {
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  })
  const roofFootprint = {
    center: [
      (buildingBounds.minX + buildingBounds.maxX) * 0.5,
      0,
      (buildingBounds.minZ + buildingBounds.maxZ) * 0.5,
    ],
    width: buildingBounds.maxX - buildingBounds.minX,
    depth: buildingBounds.maxZ - buildingBounds.minZ,
    baseY: Math.max(...rooms.map((room) => room.size[1])) + 0.1,
  }
  const exteriorContour = getExteriorContour(rooms)
  const roofGroups = getRoofGroups(rooms)
  const primaryRoofGroup = roofGroups[0] ?? null
  const annotatedRoofGroups = roofGroups.map((group, index) => {
    const requestedRoofType = rooms.find((room) => group.roomIds.includes(room.id) && room.roofType)?.roofType
    return {
      ...group,
      type: requestedRoofType ?? (index === 0 ? 'gable' : 'lean_to'),
      attachmentSide: index === 0 || !primaryRoofGroup ? null : getAttachmentSide(group, primaryRoofGroup),
    }
  })

  return {
    wallThickness,
    rooms,
    corners,
    walls,
    roofFootprint,
    exteriorContour,
    roofGroups: annotatedRoofGroups,
  }
}
