import { NEIGHBOR_HOUSES } from './outdoorData'
import { houseLayout } from './house/houseLayout'
import { collidesWithRoofStructure, getWalkableRoofHeight } from './house/roofCollision'
import { getTerrainHeight } from './terrain/terrainGeometry'

const PLAYER_ROOF_PITCH = 32
const PLAYER_ROOF_OVERHANG = 0.42
const PLAYER_ROOF_THICKNESS = 0.14

let playerRoofSurfaces = []

function getLayoutFootprintRects(layout) {
  if (layout?.footprintRects?.length) return layout.footprintRects
  return (layout?.rooms ?? houseLayout.rooms).map((room) => ({
    minX: room.position[0] - room.size[0] * 0.5,
    maxX: room.position[0] + room.size[0] * 0.5,
    minZ: room.position[2] - room.size[2] * 0.5,
    maxZ: room.position[2] + room.size[2] * 0.5,
  }))
}

function createPlayerRoofSurfaces(layout = houseLayout) {
  const wallTopY = layout.maxWallHeight
    ?? Math.max(...(layout.rooms ?? houseLayout.rooms).map((room) => room.size[1]))

  return getLayoutFootprintRects(layout).map((rect, index) => ({
    id: `player-roof-${index}`,
    type: 'gable',
    centerX: (rect.minX + rect.maxX) * 0.5,
    centerZ: (rect.minZ + rect.maxZ) * 0.5,
    width: rect.maxX - rect.minX,
    depth: rect.maxZ - rect.minZ,
    wallTopY,
    pitch: PLAYER_ROOF_PITCH,
    overhang: PLAYER_ROOF_OVERHANG,
    thickness: PLAYER_ROOF_THICKNESS,
    wallThickness: layout.wallThickness ?? houseLayout.wallThickness,
  }))
}

function transformLocalCenter(house, group) {
  const cos = Math.cos(house.rotationY)
  const sin = Math.sin(house.rotationY)
  return {
    x: house.position[0] + group.center[0] * cos - group.center[2] * sin,
    z: house.position[2] + group.center[0] * sin + group.center[2] * cos,
  }
}

function guessAttachSide(group, primaryGroup) {
  if (!primaryGroup) return 'south'
  const dx = group.center[0] - primaryGroup.center[0]
  const dz = group.center[2] - primaryGroup.center[2]
  if (Math.abs(dx) >= Math.abs(dz)) return dx > 0 ? 'west' : 'east'
  return dz > 0 ? 'south' : 'north'
}

function createNeighborRoofSurfaces() {
  return NEIGHBOR_HOUSES.flatMap((house) => {
    const primaryGroup = house.floorplan.roofGroups[0] ?? null
    const baseY = getTerrainHeight(house.position[0], house.position[2])

    return house.floorplan.roofGroups.flatMap((group, index) => {
      if (group.type === 'flat') return []

      const center = transformLocalCenter(house, group)
      if (group.type === 'lean_to') {
        return [{
          id: `${house.id}-${group.id}`,
          type: 'lean_to',
          centerX: center.x,
          centerZ: center.z,
          rotationY: house.rotationY,
          baseY,
          width: group.width,
          depth: group.depth,
          wallTopY: group.height,
          attachSide: group.attachmentSide ?? guessAttachSide(group, primaryGroup),
          rise: primaryGroup && index > 0
            ? Math.max(0.4, primaryGroup.height - group.height)
            : 0.72,
          overhang: 0.24,
          overhangAttached: 0,
          thickness: 0.14,
          wallThickness: house.floorplan.wallThickness,
        }]
      }

      return [{
        id: `${house.id}-${group.id}`,
        type: 'gable',
        centerX: center.x,
        centerZ: center.z,
        rotationY: house.rotationY,
        baseY,
        width: group.width,
        depth: group.depth,
        wallTopY: group.height,
        pitch: group.width >= group.depth ? 30 : 34,
        overhang: index === 0 ? 0.34 : 0.28,
        thickness: 0.14,
        wallThickness: house.floorplan.wallThickness,
      }]
    })
  })
}

playerRoofSurfaces = createPlayerRoofSurfaces()
const neighborRoofSurfaces = createNeighborRoofSurfaces()
let allRoofSurfaces = [...playerRoofSurfaces, ...neighborRoofSurfaces]

export function syncPlayerHouseOutdoorRoofs(layout) {
  playerRoofSurfaces = createPlayerRoofSurfaces(layout)
  allRoofSurfaces = [...playerRoofSurfaces, ...neighborRoofSurfaces]
}

export function getOutdoorHouseRoofHeight(x, z, currentFootY) {
  return getWalkableRoofHeight(x, z, currentFootY, allRoofSurfaces)
}

export function collidesWithOutdoorHouseRoof(
  x,
  z,
  footY,
  radius,
  bodyHeight,
) {
  return collidesWithRoofStructure(x, z, footY, radius, bodyHeight, allRoofSurfaces)
}
