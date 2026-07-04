import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildInteriorWallColliderBoxes,
  collidesWithInteriorWalls,
  resolveInteriorWallCollision,
  syncInteriorWallColliders,
} from './interiorCollision'
import { addInteriorWallToHousePlan, createDefaultHousePlan } from '../world/house/housePlan'
import { deriveHouseLayout } from '../world/house/deriveHouseLayout'

const PLAYER_RADIUS = 0.35

describe('interiorCollision', () => {
  beforeEach(() => {
    syncInteriorWallColliders([])
  })

  it('construit des AABB bloquants pour les cloisons du plan', () => {
    const plan = addInteriorWallToHousePlan(createDefaultHousePlan(), [-5, 0], [5, 0])
    const layout = deriveHouseLayout(plan)
    const boxes = buildInteriorWallColliderBoxes(layout)
    syncInteriorWallColliders(boxes)

    // Au milieu de la cloison (z = 0) : bloqué.
    expect(collidesWithInteriorWalls(0, 0, PLAYER_RADIUS)).toBe(true)
    // Au centre d'une des deux pieces : libre.
    expect(collidesWithInteriorWalls(0, 2.5, PLAYER_RADIUS)).toBe(false)
  })

  it('laisse passer le joueur sous une porte', () => {
    const layout = deriveHouseLayout(createDefaultHousePlan())
    syncInteriorWallColliders(buildInteriorWallColliderBoxes(layout))
    const westWall = layout.walls.find((wall) => wall.id === 'wall_main_west')
    const entrance = westWall.openings.find((opening) => opening.role === 'entrance')
    const direction = Math.sign(westWall.endCorner.z - westWall.startCorner.z)
    const doorZ = westWall.startCorner.z + direction * entrance.center

    // Dans l'embrasure de la porte d'entree (x = -5) : passage libre.
    expect(collidesWithInteriorWalls(-5, doorZ, 0.3)).toBe(false)
    // Sur le mur plein a cote : bloque.
    expect(collidesWithInteriorWalls(-5, doorZ + 2.5, 0.3)).toBe(true)
  })

  it('fait glisser le mouvement le long du mur', () => {
    syncInteriorWallColliders([{ minX: -5, maxX: 5, minZ: -0.11, maxZ: 0.11 }])
    const resolved = resolveInteriorWallCollision(0, 1, 0.4, 0.2, PLAYER_RADIUS)

    // La composante Z est bloquee par le mur, la composante X glisse.
    expect(resolved.x).toBeCloseTo(0.4)
    expect(resolved.z).toBeCloseTo(1)
  })

  it('ne bouge pas quand tout est bloque', () => {
    syncInteriorWallColliders([
      { minX: -1, maxX: 1, minZ: -0.1, maxZ: 0.1 },
      { minX: -0.1, maxX: 0.1, minZ: -1, maxZ: 1 },
    ])
    const resolved = resolveInteriorWallCollision(-0.6, -0.6, -0.3, -0.3, PLAYER_RADIUS)

    expect(resolved).toEqual({ x: -0.6, z: -0.6 })
  })
})
