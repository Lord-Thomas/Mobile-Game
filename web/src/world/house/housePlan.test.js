import { describe, expect, it } from 'vitest'
import { deriveHouseLayout } from './deriveHouseLayout'
import {
  addPrototypeEastRoom,
  addRoomToHousePlan,
  createDefaultHousePlan,
  normalizeHousePlan,
  removeHouseOpening,
  removeHouseWall,
  removeLatestInteriorWall,
  removeLatestJunctionDoor,
  resizeHouseExteriorWall,
  splitHouseWallSegment,
} from './housePlan'
import { detectHouseSpaces } from './houseSpaces'

describe('housePlan', () => {
  it('normalise un plan incomplet avec des valeurs jouables', () => {
    const plan = normalizeHousePlan({
      gridSize: -2,
      floorCells: {
        '0,0': true,
        nope: true,
      },
      walls: {
        wall_a: {
          from: [0, 0],
          to: [1, 0],
          height: 0,
        },
      },
      openings: {
        door_a: {
          wallId: 'wall_a',
          offset: 2,
          width: -4,
          height: 0,
        },
        orphan: {
          wallId: 'missing',
        },
      },
    })

    expect(plan.gridSize).toBe(0.25)
    expect(plan.floorCells).toHaveProperty('0,0')
    expect(plan.floorCells).not.toHaveProperty('nope')
    expect(plan.walls.wall_a.height).toBe(0.1)
    expect(plan.openings.door_a.offset).toBe(1)
    expect(plan.openings.door_a.width).toBe(0.1)
    expect(plan.openings).not.toHaveProperty('orphan')
  })

  it('detecte la piece principale par defaut', () => {
    const spaces = detectHouseSpaces(createDefaultHousePlan())

    expect(spaces).toHaveLength(1)
    expect(spaces[0].cells).toHaveLength(100)
  })

  it('derive un layout compatible avec murs, ouvertures et pieces detectees', () => {
    const layout = deriveHouseLayout(createDefaultHousePlan())
    const entranceWall = layout.walls.find((wall) => wall.id === 'wall_main_west')

    expect(layout.rooms).toHaveLength(1)
    expect(layout.wallThickness).toBeCloseTo(0.22)
    expect(entranceWall.openings[0]).toMatchObject({
      id: 'door_entrance',
      role: 'entrance',
      center: 7.25,
      width: 1.2,
    })
  })

  it('ajoute une extension prototype testable depuis le mode personnalisation', () => {
    const plan = addPrototypeEastRoom(createDefaultHousePlan())
    const layout = deriveHouseLayout(plan)
    const sharedWall = layout.walls.find((wall) => wall.openings.some((opening) => opening.role === 'junction'))

    expect(layout.rooms).toHaveLength(2)
    expect(plan.floorCells).toHaveProperty('5,-3')
    expect(Object.values(plan.walls).some((wall) => wall.id.endsWith('_east'))).toBe(true)
    expect(sharedWall.openings.some((opening) => opening.role === 'junction')).toBe(true)
  })

  it('ajoute des pieces configurables dans plusieurs directions', () => {
    const eastPlan = addRoomToHousePlan(createDefaultHousePlan(), {
      direction: 'east',
      width: 5,
      depth: 4,
    })
    const northPlan = addRoomToHousePlan(eastPlan, {
      direction: 'north',
      width: 4,
      depth: 3,
    })
    const layout = deriveHouseLayout(northPlan)

    expect(layout.rooms).toHaveLength(3)
    expect(northPlan.floorCells).toHaveProperty('5,-2')
    expect(northPlan.floorCells).toHaveProperty('0,5')
    expect(Object.keys(northPlan.walls).some((id) => id.includes('shared'))).toBe(true)
    expect(Object.values(northPlan.openings).filter((opening) => opening.role === 'junction')).toHaveLength(2)
  })

  it('supprime la derniere porte de jonction sans fusionner les espaces', () => {
    const plan = addRoomToHousePlan(createDefaultHousePlan(), {
      direction: 'east',
      width: 4,
      depth: 6,
    })
    const withoutDoor = removeLatestJunctionDoor(plan)
    const layout = deriveHouseLayout(withoutDoor)

    expect(Object.values(withoutDoor.openings).filter((opening) => opening.role === 'junction')).toHaveLength(0)
    expect(layout.rooms).toHaveLength(2)
  })

  it('supprime la derniere cloison interieure et fusionne les espaces', () => {
    const plan = addRoomToHousePlan(createDefaultHousePlan(), {
      direction: 'east',
      width: 4,
      depth: 6,
    })
    const openPlan = removeLatestInteriorWall(plan)
    const layout = deriveHouseLayout(openPlan)

    expect(Object.values(openPlan.openings).filter((opening) => opening.role === 'junction')).toHaveLength(0)
    expect(layout.rooms).toHaveLength(1)
  })

  it('supprime une porte ou une cloison selectionnee par id', () => {
    const plan = addRoomToHousePlan(createDefaultHousePlan(), {
      direction: 'east',
      width: 4,
      depth: 6,
    })
    const door = Object.values(plan.openings).find((opening) => opening.role === 'junction')
    const withoutDoor = removeHouseOpening(plan, door.id)
    const wall = Object.values(withoutDoor.walls).find((candidate) => candidate.id === door.wallId)
    const withoutWall = removeHouseWall(withoutDoor, wall.id)

    expect(withoutDoor.openings).not.toHaveProperty(door.id)
    expect(withoutWall.walls).not.toHaveProperty(wall.id)
    expect(deriveHouseLayout(withoutWall).rooms).toHaveLength(1)
  })

  it('redimensionne un mur exterieur en ajoutant des cellules de sol', () => {
    const plan = createDefaultHousePlan()
    const resized = resizeHouseExteriorWall(plan, 'wall_main_east', 2)
    const layout = deriveHouseLayout(resized)

    expect(resized.floorCells).toHaveProperty('5,-5')
    expect(resized.floorCells).toHaveProperty('6,4')
    expect(resized.walls.wall_main_east.from[0]).toBe(7)
    expect(layout.rooms[0].size[0]).toBe(12)
  })

  it('decoupe un mur en segments puis redimensionne seulement une portion', () => {
    const segmented = splitHouseWallSegment(createDefaultHousePlan(), 'wall_main_east', 0.5)
    const segment = Object.values(segmented.walls).find((wall) => (
      wall.id.startsWith('wall_main_east_') &&
      wall.from[1] === -5
    ))
    const resized = resizeHouseExteriorWall(segmented, segment.id, 2)
    const resizedSegment = resized.walls[segment.id]
    const connector = Object.values(resized.walls).find((wall) => wall.id.includes('connector'))
    const everyWallAxisAligned = Object.values(resized.walls).every((wall) => (
      wall.from[0] === wall.to[0] || wall.from[1] === wall.to[1]
    ))

    expect(segmented.walls).not.toHaveProperty('wall_main_east')
    expect(segment).toBeTruthy()
    expect(resizedSegment.from[0]).toBe(7)
    expect(connector).toBeTruthy()
    expect(everyWallAxisAligned).toBe(true)
    expect(resized.floorCells).toHaveProperty('6,-1')
    expect(resized.floorCells).not.toHaveProperty('6,1')
  })
})
