import { describe, expect, it } from 'vitest'
import { rebaseMountAltitudeForSurface } from './mountGrounding'

describe('mount roof grounding', () => {
  it('keeps the dragon at the same world height when a roof becomes the ground', () => {
    const altitude = rebaseMountAltitudeForSurface({
      currentGroundY: 0,
      nextGroundY: 5,
      currentAltitude: 7,
      nextAltitude: 6.8,
      canFly: true,
      ledgeDrop: 0.85,
    })

    expect(5 + altitude).toBeCloseTo(6.8, 5)
  })

  it('turns a large drop from a roof into flight instead of teleporting down', () => {
    const altitude = rebaseMountAltitudeForSurface({
      currentGroundY: 5,
      nextGroundY: 0,
      currentAltitude: 0,
      nextAltitude: 0,
      canFly: true,
      ledgeDrop: 0.85,
    })

    expect(altitude).toBe(5)
  })

  it('continues following small terrain variations while grounded', () => {
    const altitude = rebaseMountAltitudeForSurface({
      currentGroundY: 1,
      nextGroundY: 0.8,
      currentAltitude: 0,
      nextAltitude: 0,
      canFly: true,
      ledgeDrop: 0.85,
    })

    expect(altitude).toBe(0)
  })
})
