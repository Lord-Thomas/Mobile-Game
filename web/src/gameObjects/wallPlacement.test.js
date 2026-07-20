import { describe, expect, it } from 'vitest'
import { houseLayout } from '../world/house/houseLayout'
import { getClosestWallMountTransform, getWallMountTargets, getWallMountTransform, getWallMountTransformFromRay, isWallCutAwayFromCamera } from './wallPlacement'

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

  it('selects the closest wall continuously from a top-down pointer', () => {
    const targets = getWallMountTargets(houseLayout, 1.5, 0.86)
    const firstWall = targets[0].wall
    const center = {
      x: (firstWall.startCorner.x + firstWall.endCorner.x) * 0.5,
      y: 1.5,
      z: (firstWall.startCorner.z + firstWall.endCorner.z) * 0.5,
    }
    const transform = getClosestWallMountTransform(targets, center, 1.5, 0.86, 0.07)

    expect(transform).not.toBeNull()
    expect(transform.wallId).toBe(firstWall.id)
  })

  it('switches walls using a perspective pointer ray', () => {
    const targets = getWallMountTargets(houseLayout, 1.5, 0.86)
    const target = targets[0]
    const center = {
      x: (target.wall.startCorner.x + target.wall.endCorner.x) * 0.5,
      z: (target.wall.startCorner.z + target.wall.endCorner.z) * 0.5,
    }
    const normal = target.normal
    const ray = {
      origin: { x: center.x + normal[0] * 8, y: 1.5, z: center.z + normal[2] * 8 },
      direction: { x: -normal[0], y: 0, z: -normal[2] },
    }
    const transform = getWallMountTransformFromRay([target], ray, 1.5, 0.86, 0.07)

    expect(transform).not.toBeNull()
    expect(transform.wallId).toBe(target.wall.id)
  })
})
