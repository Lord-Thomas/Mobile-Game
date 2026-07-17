import { describe, expect, it } from 'vitest'
import { houseLayout } from '../world/house/houseLayout'
import { getWallMountTargets, getWallMountTransform } from './wallPlacement'

describe('wall placement', () => {
  it('excludes wall pieces that are too small for the frame', () => {
    const targets = getWallMountTargets(houseLayout, 1.5, 0.86)
    expect(targets.length).toBeGreaterThan(0)
    expect(targets.every(({ rect }) => rect.width >= 1.5 && rect.height >= 0.86)).toBe(true)
  })

  it('clamps a frame inside the selected wall rectangle', () => {
    const target = getWallMountTargets(houseLayout, 1.5, 0.86)[0]
    const transform = getWallMountTransform(target, { x: -100, y: 100, z: -100 }, 1.5, 0.86, 0.07)
    const halfHeight = 0.86 / 2
    expect(transform.position[1]).toBeLessThanOrEqual(target.rect.y + target.rect.height / 2 - halfHeight)
    expect(transform.wallId).toBe(target.wall.id)
    expect(Number.isFinite(transform.rotationY)).toBe(true)
  })
})
