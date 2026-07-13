import { describe, expect, it } from 'vitest'
import { deriveHouseLayout, getHouseEntranceTransform } from './deriveHouseLayout'
import {
  addHouseOpeningToWall,
  addInteriorWallToHousePlan,
  addPrototypeEastRoom,
  addRoomToHousePlan,
  createDefaultHousePlan,
  moveHouseInteriorWall,
  moveHouseOpening,
  moveHouseWallJoint,
  normalizeHousePlan,
  removeHouseOpening,
  removeHouseWall,
  removeLatestInteriorWall,
  removeLatestJunctionDoor,
  resizeHouseExteriorWall,
  resizeHouseWallEnd,
  setHouseEntranceDoor,
  setHouseFloorStyleForCells,
  setHouseOpeningSpan,
  setHouseOpeningVertical,
  setHouseWallSideStyle,
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

  it('place un segment a la position choisie sur le mur', () => {
    const segmented = splitHouseWallSegment(createDefaultHousePlan(), 'wall_main_east', 0.3)
    const eastSegments = Object.values(segmented.walls)
      .filter((wall) => wall.id.startsWith('wall_main_east_'))
      .sort((a, b) => a.from[1] - b.from[1])

    expect(eastSegments).toHaveLength(2)
    expect(eastSegments.some((wall) => wall.to[1] === -2)).toBe(true)
    expect(eastSegments.some((wall) => wall.from[1] === -2)).toBe(true)
  })

  it('ajoute une cloison interne entre deux points', () => {
    const plan = addInteriorWallToHousePlan(createDefaultHousePlan(), [-5, 0], [5, 0])
    const partition = Object.values(plan.walls).find((wall) => wall.id.startsWith('wall_partition'))
    const layout = deriveHouseLayout(plan)

    expect(partition).toMatchObject({ from: [-5, 0], to: [5, 0] })
    expect(layout.rooms).toHaveLength(2)
  })

  it('aligne une cloison sur les bords de cellules pour separer les espaces', () => {
    // Points snappés à 0.25 par l'éditeur : la cloison doit être ramenée sur
    // la grille entière, sinon la détection d'espaces ne la voit pas.
    const plan = addInteriorWallToHousePlan(createDefaultHousePlan(), [-4.75, 2.25], [5.25, 2.25])
    const partition = Object.values(plan.walls).find((wall) => wall.id.startsWith('wall_partition'))

    expect(partition).toMatchObject({ from: [-5, 2], to: [5, 2] })
    expect(deriveHouseLayout(plan).rooms).toHaveLength(2)
  })

  it('applique une tapisserie differente sur chaque cote d une cloison', () => {
    const plan = addInteriorWallToHousePlan(createDefaultHousePlan(), [-5, 0], [5, 0])
    const partition = Object.values(plan.walls).find((wall) => wall.id.startsWith('wall_partition'))
    const painted = setHouseWallSideStyle(
      setHouseWallSideStyle(plan, partition.id, 'left', 'wall-briques-01'),
      partition.id,
      'right',
      'wall-brun-mat',
    )
    const layoutWall = deriveHouseLayout(painted).walls.find((wall) => wall.id === partition.id)
    const leftSide = layoutWall.sideA.sideKey === 'left' ? layoutWall.sideA : layoutWall.sideB
    const rightSide = layoutWall.sideA.sideKey === 'right' ? layoutWall.sideA : layoutWall.sideB

    expect(leftSide.styleId).toBe('wall-briques-01')
    expect(rightSide.styleId).toBe('wall-brun-mat')
  })

  it('deplace une porte sur son mur', () => {
    const plan = createDefaultHousePlan()
    const moved = moveHouseOpening(plan, 'door_entrance', 'wall_main_west', 0.35)

    expect(moved.openings.door_entrance.wallId).toBe('wall_main_west')
    expect(moved.openings.door_entrance.offset).toBeCloseTo(0.35)
  })

  it('ajoute une porte sur une cloison sans fusionner les espaces', () => {
    const plan = addInteriorWallToHousePlan(createDefaultHousePlan(), [-5, 0], [5, 0])
    const partition = Object.values(plan.walls).find((wall) => wall.id.startsWith('wall_partition'))
    const withDoor = addHouseOpeningToWall(plan, partition.id, 0.5)
    const door = Object.values(withDoor.openings).find((opening) => opening.wallId === partition.id)

    expect(door).toMatchObject({ type: 'door', role: 'normal', width: 1.2 })
    expect(deriveHouseLayout(withDoor).rooms).toHaveLength(2)
  })

  it('refuse une porte qui chevauche une porte existante', () => {
    const plan = createDefaultHousePlan()
    const unchanged = addHouseOpeningToWall(plan, 'wall_main_west', 0.725)

    expect(Object.keys(unchanged.openings)).toHaveLength(Object.keys(plan.openings).length)
  })

  it('definit une porte exterieure comme entree principale', () => {
    const plan = addHouseOpeningToWall(createDefaultHousePlan(), 'wall_main_east', 0.5)
    const newDoor = Object.values(plan.openings).find((opening) => opening.wallId === 'wall_main_east')
    const updated = setHouseEntranceDoor(plan, newDoor.id)

    expect(updated.entranceDoorId).toBe(newDoor.id)
    expect(updated.openings[newDoor.id].role).toBe('entrance')
    expect(updated.openings.door_entrance.role).toBe('normal')
  })

  it('refuse de definir une porte interieure comme entree', () => {
    const plan = addRoomToHousePlan(createDefaultHousePlan(), {
      direction: 'east',
      width: 4,
      depth: 6,
    })
    const junctionDoor = Object.values(plan.openings).find((opening) => opening.role === 'junction')
    const unchanged = setHouseEntranceDoor(plan, junctionDoor.id)

    expect(unchanged.entranceDoorId).toBe('door_entrance')
    expect(unchanged.openings[junctionDoor.id].role).toBe('junction')
  })

  it('ne supprime jamais la porte d entree', () => {
    const plan = createDefaultHousePlan()
    const unchanged = removeHouseOpening(plan, 'door_entrance')

    expect(unchanged.openings).toHaveProperty('door_entrance')
    expect(unchanged.entranceDoorId).toBe('door_entrance')
  })

  it('deplace une cloison interieure perpendiculairement', () => {
    const plan = addInteriorWallToHousePlan(createDefaultHousePlan(), [-5, 0], [5, 0])
    const partition = Object.values(plan.walls).find((wall) => wall.id.startsWith('wall_partition'))
    const moved = moveHouseInteriorWall(plan, partition.id, 2)
    const movedPartition = moved.walls[partition.id]

    expect(movedPartition.from[1]).toBe(2)
    expect(movedPartition.to[1]).toBe(2)
    expect(deriveHouseLayout(moved).rooms).toHaveLength(2)
  })

  it('refuse de deplacer un mur exterieur comme une cloison', () => {
    const plan = createDefaultHousePlan()
    const unchanged = moveHouseInteriorWall(plan, 'wall_main_east', 1)

    expect(unchanged.walls.wall_main_east.from[0]).toBe(5)
  })

  it('deplace une cloison de jonction avec connecteurs sans mur diagonal', () => {
    const plan = addRoomToHousePlan(createDefaultHousePlan(), {
      direction: 'east',
      width: 4,
      depth: 6,
    })
    const junctionDoor = Object.values(plan.openings).find((opening) => opening.role === 'junction')
    const sharedWall = plan.walls[junctionDoor.wallId]
    const moved = moveHouseInteriorWall(plan, sharedWall.id, 1)
    const everyWallAxisAligned = Object.values(moved.walls).every((wall) => (
      wall.from[0] === wall.to[0] || wall.from[1] === wall.to[1]
    ))

    expect(moved.walls[sharedWall.id].from[0]).toBe(4)
    expect(everyWallAxisAligned).toBe(true)
    expect(deriveHouseLayout(moved).rooms).toHaveLength(2)
    expect(moved.openings[junctionDoor.id].wallId).toBe(sharedWall.id)
  })

  it('redimensionne une cloison par son extremite libre', () => {
    const plan = addInteriorWallToHousePlan(createDefaultHousePlan(), [-5, 0], [5, 0])
    const partition = Object.values(plan.walls).find((wall) => wall.id.startsWith('wall_partition'))
    const resized = resizeHouseWallEnd(plan, partition.id, 'to', 2)
    const resizedPartition = resized.walls[partition.id]

    expect(resizedPartition.to).toEqual([2, 0])
    // La cloison ne ferme plus l'espace : une seule piece detectee.
    expect(deriveHouseLayout(resized).rooms).toHaveLength(1)
  })

  it('refuse de redimensionner par une extremite partagee avec un autre mur', () => {
    const plan = createDefaultHousePlan()
    const unchanged = resizeHouseWallEnd(plan, 'wall_main_east', 'to', 2)

    expect(unchanged.walls.wall_main_east.to[1]).toBe(5)
  })

  it('deplace un point de segment en recoupant le mur', () => {
    const segmented = splitHouseWallSegment(createDefaultHousePlan(), 'wall_main_east', 0.5)
    const segments = Object.values(segmented.walls)
      .filter((wall) => wall.id.startsWith('wall_main_east_'))
    const moved = moveHouseWallJoint(segmented, segments[0].id, segments[1].id, 2)
    const movedSegments = [moved.walls[segments[0].id], moved.walls[segments[1].id]]
    const jointValues = movedSegments.flatMap((wall) => [wall.from[1], wall.to[1]])

    expect(jointValues.filter((value) => value === 2)).toHaveLength(2)
    expect(deriveHouseLayout(moved).rooms).toHaveLength(1)
  })

  it('empeche un point de segment de traverser une porte', () => {
    const segmented = splitHouseWallSegment(createDefaultHousePlan(), 'wall_main_west', 0.5)
    const segments = Object.values(segmented.walls)
      .filter((wall) => wall.id.startsWith('wall_main_west_'))
    const entrance = Object.values(segmented.openings).find((opening) => opening.role === 'entrance')
    const entranceWall = segmented.walls[entrance.wallId]
    const span = {
      center: entranceWall.from[1] + (entranceWall.to[1] - entranceWall.from[1]) * entrance.offset,
    }
    const moved = moveHouseWallJoint(segmented, segments[0].id, segments[1].id, Math.round(span.center))
    const jointValues = [moved.walls[segments[0].id], moved.walls[segments[1].id]]
      .flatMap((wall) => [wall.from[1], wall.to[1]])
    const jointValue = jointValues
      .filter((value, index, list) => list.indexOf(value) !== index)
      .at(0)

    expect(Math.abs(jointValue - span.center)).toBeGreaterThanOrEqual(entrance.width * 0.5)
  })

  it('ajoute une vitre avec allege et hauteur de fenetre', () => {
    const plan = addHouseOpeningToWall(createDefaultHousePlan(), 'wall_main_north', 0.5, { type: 'window' })
    const window = Object.values(plan.openings).find((opening) => opening.type === 'window')

    expect(window).toMatchObject({
      wallId: 'wall_main_north',
      type: 'window',
      width: 1.6,
      bottom: 0.9,
      height: 1.4,
    })
    // Une vitre n'est jamais une entree possible.
    expect(setHouseEntranceDoor(plan, window.id).entranceDoorId).toBe('door_entrance')
  })

  it('redimensionne une vitre sur son mur', () => {
    const plan = addHouseOpeningToWall(createDefaultHousePlan(), 'wall_main_north', 0.5, { type: 'window' })
    const window = Object.values(plan.openings).find((opening) => opening.type === 'window')
    const resized = setHouseOpeningSpan(plan, window.id, 0.4, 3)

    expect(resized.openings[window.id].width).toBeCloseTo(3)
    expect(resized.openings[window.id].offset).toBeCloseTo(0.4)
  })

  it('borne le redimensionnement d une ouverture aux limites du mur', () => {
    const plan = addHouseOpeningToWall(createDefaultHousePlan(), 'wall_main_north', 0.5, { type: 'window' })
    const window = Object.values(plan.openings).find((opening) => opening.type === 'window')
    const resized = setHouseOpeningSpan(plan, window.id, 0.02, 30)
    const result = resized.openings[window.id]
    const length = 10

    expect(result.width).toBeCloseTo(length - 0.4)
    expect(result.offset * length - result.width * 0.5).toBeGreaterThanOrEqual(0.2 - 1e-6)
  })

  it('regle la hauteur d une vitre dans les bornes du mur', () => {
    const plan = addHouseOpeningToWall(createDefaultHousePlan(), 'wall_main_north', 0.5, { type: 'window' })
    const window = Object.values(plan.openings).find((opening) => opening.type === 'window')
    const taller = setHouseOpeningVertical(plan, window.id, { height: 2 })
    const clamped = setHouseOpeningVertical(plan, window.id, { height: 50 })

    expect(taller.openings[window.id].height).toBeCloseTo(2)
    expect(taller.openings[window.id].bottom).toBeCloseTo(0.9)
    // Mur de hauteur 5, allege 0.9, linteau minimal 0.1 → hauteur max 4.
    expect(clamped.openings[window.id].height).toBeCloseTo(4)
  })

  it('refuse un redimensionnement qui chevauche une autre ouverture', () => {
    const plan = addHouseOpeningToWall(createDefaultHousePlan(), 'wall_main_west', 0.25, { type: 'window' })
    const window = Object.values(plan.openings).find((opening) => opening.type === 'window')
    // L'entree est a offset 0.725 sur le meme mur : grossir jusqu'a elle est refuse.
    const resized = setHouseOpeningSpan(plan, window.id, 0.5, 6)

    expect(resized.openings[window.id].width).toBe(window.width)
    expect(resized.openings[window.id].offset).toBe(window.offset)
  })

  it('applique une texture de sol a toutes les cellules d une piece', () => {
    const plan = createDefaultHousePlan()
    const spaces = detectHouseSpaces(plan)
    const painted = setHouseFloorStyleForCells(plan, spaces[0].cells, 'floor-tomette')
    const layout = deriveHouseLayout(painted)
    const tometteGroup = layout.floorStyleRects.find((group) => group.styleId === 'floor-tomette')

    expect(Object.keys(painted.styles.floorByCell)).toHaveLength(100)
    expect(tometteGroup).toBeTruthy()
    expect(layout.floorStyleRects).toHaveLength(1)
  })

  it('applique une texture par cote de mur et l expose dans le layout', () => {
    const plan = setHouseWallSideStyle(createDefaultHousePlan(), 'wall_main_north', 'inside', 'wall-briques-01')
    const layout = deriveHouseLayout(plan)
    const northWall = layout.walls.find((wall) => wall.id === 'wall_main_north')
    const roomSide = northWall.sideA.type === 'room' ? northWall.sideA : northWall.sideB

    expect(plan.styles.wallBySide['wall_main_north:inside']).toBe('wall-briques-01')
    expect(roomSide.styleId).toBe('wall-briques-01')
  })

  it('retire un style de sol avec styleId null', () => {
    const plan = setHouseFloorStyleForCells(createDefaultHousePlan(), ['0,0'], 'floor-tomette')
    const cleared = setHouseFloorStyleForCells(plan, ['0,0'], null)

    expect(cleared.styles.floorByCell).not.toHaveProperty('0,0')
  })

  it('calcule la transformation monde de la porte d entree', () => {
    const transform = getHouseEntranceTransform(deriveHouseLayout(createDefaultHousePlan()))

    expect(transform).toMatchObject({
      openingId: 'door_entrance',
      wallId: 'wall_main_west',
      isFallback: false,
    })
    expect(transform.doorPosition.x).toBeCloseTo(-5)
    expect(transform.doorPosition.z).toBeCloseTo(-2.25)
    expect(transform.outsideNormal[0]).toBeCloseTo(-1)
    expect(transform.outsideNormal[2]).toBeCloseTo(0)
    expect(transform.insidePosition.x).toBeCloseTo(-3.8)
    expect(transform.outsidePosition.x).toBeCloseTo(-7.2)
  })

  it('suit la porte d entree quand elle change de mur', () => {
    const plan = addHouseOpeningToWall(createDefaultHousePlan(), 'wall_main_east', 0.5)
    const newDoor = Object.values(plan.openings).find((opening) => opening.wallId === 'wall_main_east')
    const updated = setHouseEntranceDoor(plan, newDoor.id)
    const transform = getHouseEntranceTransform(deriveHouseLayout(updated))

    expect(transform.openingId).toBe(newDoor.id)
    expect(transform.doorPosition.x).toBeCloseTo(5)
    expect(transform.outsideNormal[0]).toBeCloseTo(1)
    expect(transform.outsideNormal[2]).toBeCloseTo(0)
    expect(transform.isFallback).toBe(false)
  })

  it('retombe sur une porte exterieure quand l entree est retrogradee', () => {
    const westPlan = addRoomToHousePlan(createDefaultHousePlan(), {
      direction: 'west',
      width: 4,
      depth: 6,
    })
    const withExteriorDoor = addHouseOpeningToWall(westPlan, 'wall_main_east', 0.5)
    const transform = getHouseEntranceTransform(deriveHouseLayout(withExteriorDoor))

    expect(westPlan.entranceDoorId).toBeNull()
    expect(transform.isFallback).toBe(true)
    expect(transform.doorPosition.x).toBeCloseTo(5)
  })

  it('retrograde l entree quand son mur devient interieur', () => {
    const plan = addRoomToHousePlan(createDefaultHousePlan(), {
      direction: 'west',
      width: 4,
      depth: 6,
    })
    const oldEntrance = Object.values(plan.openings).find((opening) => opening.id === 'door_entrance')

    expect(deriveHouseLayout(plan).rooms).toHaveLength(2)
    expect(plan.entranceDoorId).toBeNull()
    expect(oldEntrance.role).toBe('normal')
  })
})
