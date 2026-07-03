import { describe, expect, it } from 'vitest'
import { deriveHouseLayout } from './deriveHouseLayout'
import { addPrototypeEastRoom, createDefaultHousePlan, normalizeHousePlan } from './housePlan'
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
    const sharedWall = layout.walls.find((wall) => wall.id === 'wall_main_east')

    expect(layout.rooms).toHaveLength(2)
    expect(plan.floorCells).toHaveProperty('5,-3')
    expect(plan.walls).toHaveProperty('wall_extension_east')
    expect(sharedWall.openings.some((opening) => opening.id === 'door_main_to_extension')).toBe(true)
  })
})
