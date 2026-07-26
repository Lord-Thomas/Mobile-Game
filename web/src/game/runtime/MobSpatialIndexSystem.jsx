import { FRAME_PHASES } from './frameScheduler'
import { useGameFrameTask } from './useGameFrameTask'

export default function MobSpatialIndexSystem({ mobGroupRef, spatialIndexRef }) {
  useGameFrameTask(() => {
    const spatialIndex = spatialIndexRef?.current
    if (!spatialIndex) return

    spatialIndex.clear()
    let order = 0
    for (const [id, mob] of mobGroupRef?.current ?? []) {
      const position = mob.getPosition()
      spatialIndex.insertKeyedPoint(
        id,
        { id, mob, position },
        position.x,
        position.z,
        order,
      )
      order += 1
    }
  }, {
    label: 'mob-spatial-index',
    phase: FRAME_PHASES.PRE_SIMULATION,
  })

  return null
}
