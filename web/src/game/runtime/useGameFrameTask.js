import { useLayoutEffect, useRef } from 'react'
import { FRAME_PHASES, gameFrameScheduler } from './frameScheduler'

export function useGameFrameTask(callback, {
  enabled = true,
  label = 'anonymous',
  phase = FRAME_PHASES.SIMULATION,
  interval = 0,
  intervalRef = null,
} = {}) {
  const callbackRef = useRef(callback)
  const accumulatedDeltaRef = useRef(0)
  const previousIntervalRef = useRef(0)

  useLayoutEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useLayoutEffect(() => {
    if (!enabled) return undefined
    return gameFrameScheduler.register(
      (state, delta) => {
        const nextInterval = intervalRef?.current ?? interval
        if (!Number.isFinite(nextInterval)) {
          accumulatedDeltaRef.current = 0
          previousIntervalRef.current = nextInterval
          return
        }
        if (!(nextInterval > 0)) {
          accumulatedDeltaRef.current = 0
          previousIntervalRef.current = nextInterval
          callbackRef.current(state, delta)
          return
        }
        if (!Number.isFinite(previousIntervalRef.current)) {
          accumulatedDeltaRef.current = 0
        }
        previousIntervalRef.current = nextInterval
        accumulatedDeltaRef.current += delta
        if (accumulatedDeltaRef.current < nextInterval) return

        const taskDelta = accumulatedDeltaRef.current
        accumulatedDeltaRef.current %= nextInterval
        callbackRef.current(state, taskDelta)
      },
      { label, phase },
    )
  }, [enabled, interval, intervalRef, label, phase])
}
