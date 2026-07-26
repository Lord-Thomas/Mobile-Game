import { useLayoutEffect, useRef } from 'react'
import { FRAME_PHASES, gameFrameScheduler } from './frameScheduler'

export function useGameFrameTask(callback, {
  enabled = true,
  label = 'anonymous',
  phase = FRAME_PHASES.SIMULATION,
} = {}) {
  const callbackRef = useRef(callback)

  useLayoutEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useLayoutEffect(() => {
    if (!enabled) return undefined
    return gameFrameScheduler.register(
      (state, delta) => callbackRef.current(state, delta),
      { label, phase },
    )
  }, [enabled, label, phase])
}
