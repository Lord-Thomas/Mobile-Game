import { describe, expect, it } from 'vitest'
import {
  accumulatePendingCameraDrag,
  clearPendingCameraDrag,
  consumePendingCameraDrag,
} from './cameraInput'

describe('cameraInput', () => {
  it('coalesces pointer movements and applies them once per rendered frame', () => {
    const touch = { cameraYaw: 1, cameraPitch: -0.2, lookDeltaX: 0, lookDeltaY: 0 }

    accumulatePendingCameraDrag(touch, 4, -2)
    accumulatePendingCameraDrag(touch, 6, 5)

    expect(consumePendingCameraDrag(touch, {
      sensitivity: 0.007,
      minPitch: -1,
      maxPitch: 0.5,
    })).toMatchObject({
      deltaX: 10,
      deltaY: 3,
      yawDelta: -0.07,
      pitchDelta: 0.021,
    })
    expect(touch.cameraYaw).toBeCloseTo(0.93)
    expect(touch.cameraPitch).toBeCloseTo(-0.179)
    expect(touch.lookDeltaX).toBe(0)
    expect(touch.lookDeltaY).toBe(0)
    expect(consumePendingCameraDrag(touch, { sensitivity: 0.007 })).toBeNull()
  })

  it('preserves pitch limits and can discard pending movement', () => {
    const touch = { cameraYaw: 0, cameraPitch: 0.49 }

    accumulatePendingCameraDrag(touch, 0, 20)
    consumePendingCameraDrag(touch, { sensitivity: 0.007, minPitch: -1, maxPitch: 0.5 })
    expect(touch.cameraPitch).toBe(0.5)

    accumulatePendingCameraDrag(touch, 12, 8)
    clearPendingCameraDrag(touch)
    expect(consumePendingCameraDrag(touch, { sensitivity: 0.007 })).toBeNull()
  })
})
