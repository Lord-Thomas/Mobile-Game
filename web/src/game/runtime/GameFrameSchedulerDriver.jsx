import { useFrame } from '@react-three/fiber'
import { gameFrameScheduler } from './frameScheduler'

const SCHEDULER_DRIVER_PRIORITY = -1000

export default function GameFrameSchedulerDriver() {
  useFrame((state, delta) => {
    gameFrameScheduler.tick(state, delta)
  }, SCHEDULER_DRIVER_PRIORITY)

  return null
}
