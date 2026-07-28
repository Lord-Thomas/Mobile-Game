import { describe, expect, it } from 'vitest'
import {
  collidesWithRoofStructure,
  getGableRoofSurfaceHeight,
  getLeanToRoofSurfaceHeight,
  getWalkableRoofHeight,
} from './roofCollision'

const gable = {
  type: 'gable',
  centerX: 4,
  centerZ: -2,
  width: 8,
  depth: 6,
  wallTopY: 5,
  pitch: 32,
  overhang: 0.4,
  thickness: 0.14,
}

describe('house roof collision', () => {
  it('follows the visible slope of a gable roof', () => {
    const ridgeHeight = getGableRoofSurfaceHeight(4, -2, gable)
    const eaveHeight = getGableRoofSurfaceHeight(4, 1.4, gable)

    expect(ridgeHeight).toBeGreaterThan(eaveHeight)
    expect(eaveHeight).toBeCloseTo(5.14, 5)
    expect(getGableRoofSurfaceHeight(20, -2, gable)).toBeNull()
  })

  it('supports rotated roofs in world space', () => {
    const rotated = { ...gable, rotationY: Math.PI / 2 }
    const ridgeHeight = getGableRoofSurfaceHeight(4, -2, rotated)
    const eaveHeight = getGableRoofSurfaceHeight(7.4, -2, rotated)

    expect(ridgeHeight).toBeGreaterThan(eaveHeight)
    expect(eaveHeight).toBeCloseTo(5.14, 5)
  })

  it('follows the attachment direction of a lean-to roof', () => {
    const leanTo = {
      type: 'lean_to',
      centerX: 0,
      centerZ: 0,
      width: 4,
      depth: 4,
      wallTopY: 3,
      attachSide: 'south',
      rise: 1.2,
      overhang: 0,
      overhangAttached: 0,
    }

    expect(getLeanToRoofSurfaceHeight(0, -2, leanTo)).toBeCloseTo(4.2, 5)
    expect(getLeanToRoofSurfaceHeight(0, 2, leanTo)).toBeCloseTo(3, 5)
  })

  it('allows landing from above without snapping a ground player onto a roof', () => {
    const ridgeHeight = getGableRoofSurfaceHeight(4, -2, gable)

    expect(getWalkableRoofHeight(4, -2, ridgeHeight + 1, [gable])).toBeCloseTo(ridgeHeight, 5)
    expect(getWalkableRoofHeight(4, -2, 0, [gable])).toBeNull()
    expect(getWalkableRoofHeight(4, -2, ridgeHeight - 0.3, [gable])).toBeCloseTo(ridgeHeight, 5)
  })

  it('blocks the triangular gable wall without extending above the roof', () => {
    const endX = gable.centerX + gable.width * 0.5

    expect(collidesWithRoofStructure(endX, -2, 5.2, 0.3, 1.72, [gable])).toBe(true)
    expect(collidesWithRoofStructure(endX, -2, 10, 0.3, 1.72, [gable])).toBe(false)
  })

  it('blocks a body crossing a roof from below but allows standing on it', () => {
    const surfaceHeight = getGableRoofSurfaceHeight(4, -2, gable)

    expect(collidesWithRoofStructure(4, -2, surfaceHeight - 1, 0.3, 1.72, [gable])).toBe(true)
    expect(collidesWithRoofStructure(4, -2, surfaceHeight, 0.3, 1.72, [gable])).toBe(false)
  })

  it('blocks the raised end wall of a lean-to roof', () => {
    const leanTo = {
      type: 'lean_to',
      centerX: 0,
      centerZ: 0,
      width: 4,
      depth: 4,
      wallTopY: 3,
      attachSide: 'south',
      rise: 1.2,
      overhang: 0.24,
      overhangAttached: 0,
      wallThickness: 0.18,
    }

    expect(collidesWithRoofStructure(2, -1.5, 3.05, 0.3, 1.72, [leanTo])).toBe(true)
    expect(collidesWithRoofStructure(2, -1.5, 6, 0.3, 1.72, [leanTo])).toBe(false)
  })
})
