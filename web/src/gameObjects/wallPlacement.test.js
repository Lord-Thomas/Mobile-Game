import { describe, expect, it } from 'vitest'
import { houseLayout } from '../world/house/houseLayout'
import { getWallMountTargets, getWallMountTransform, isWallCutAwayFromCamera } from './wallPlacement'

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

  it('identifies only the exterior wall facing the camera as cut away', () => {
    const wall = houseLayout.walls.find((candidate) => (
      candidate.sideA?.type === 'outside' || candidate.sideB?.type === 'outside'
    ))
    const outside = wall.sideA?.type === 'outside' ? wall.sideA : wall.sideB
    const center = {
      x: (wall.startCorner.x + wall.endCorner.x) * 0.5,
      z: (wall.startCorner.z + wall.endCorner.z) * 0.5,
    }

    expect(isWallCutAwayFromCamera(wall, {
      x: center.x + outside.normal[0] * 20,
      z: center.z + outside.normal[2] * 20,
    })).toBe(true)
    expect(isWallCutAwayFromCamera(wall, {
      x: center.x - outside.normal[0] * 20,
      z: center.z - outside.normal[2] * 20,
    })).toBe(false)
  })
})
