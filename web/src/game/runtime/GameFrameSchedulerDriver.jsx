import { useFrame } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import { gameAnimationMixerRegistry } from './animationMixerRegistry'
import { FRAME_PHASES, gameFrameScheduler } from './frameScheduler'

const SCHEDULER_DRIVER_PRIORITY = -1000

export default function GameFrameSchedulerDriver() {
  useLayoutEffect(() => gameFrameScheduler.register(
    (_, delta) => gameAnimationMixerRegistry.update(delta),
    {
      label: 'animation-mixers',
      phase: FRAME_PHASES.POST_SIMULATION,
    },
  ), [])

  useFrame((state, delta) => {
    gameFrameScheduler.tick(state, delta)
  }, SCHEDULER_DRIVER_PRIORITY)

  return null
}
