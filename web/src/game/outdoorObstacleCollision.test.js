import { describe, expect, it } from 'vitest'
import {
  MIN_TREE_TRUNK_COLLISION_RADIUS,
  OUTDOOR_PLAYER_COLLISION_HEIGHT,
  getScaledTreeTrunkCollisionRadius,
  overlapsOutdoorColliderHeight,
} from './outdoorObstacleCollision'

describe('overlapsOutdoorColliderHeight', () => {
  const houseWall = { y: 1.6, hy: 1.6 }

  it('bloque le joueur lorsque son corps croise le mur', () => {
    expect(overlapsOutdoorColliderHeight(houseWall, 0)).toBe(true)
    expect(overlapsOutdoorColliderHeight(houseWall, 2.8)).toBe(true)
  })

  it('laisse passer le joueur en vol au-dessus du mur', () => {
    expect(overlapsOutdoorColliderHeight(houseWall, 3.2)).toBe(false)
    expect(overlapsOutdoorColliderHeight(houseWall, 5)).toBe(false)
  })

  it('conserve les anciens obstacles sans hauteur explicite', () => {
    expect(overlapsOutdoorColliderHeight({ x: 0, z: 0, radius: 1 }, 20)).toBe(true)
  })

  it('utilise la hauteur corporelle attendue', () => {
    expect(OUTDOOR_PLAYER_COLLISION_HEIGHT).toBeGreaterThan(1.5)
  })
})

describe('getScaledTreeTrunkCollisionRadius', () => {
  it('suit le rayon et l’échelle réels du tronc', () => {
    expect(getScaledTreeTrunkCollisionRadius(1.8, 0.12))
      .toBeCloseTo(1.8 * 0.12 * 1.08)
  })

  it('conserve un petit rayon minimal pour les troncs très fins', () => {
    expect(getScaledTreeTrunkCollisionRadius(0.1, 0.01))
      .toBe(MIN_TREE_TRUNK_COLLISION_RADIUS)
  })
})
