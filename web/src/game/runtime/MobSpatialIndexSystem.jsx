import { useRef } from 'react'
import { FRAME_PHASES } from './frameScheduler'
import { useGameFrameTask } from './useGameFrameTask'

export default function MobSpatialIndexSystem({ mobGroupRef, spatialIndexRef }) {
  const fallbackSpatialValuesRef = useRef(new WeakMap())

  useGameFrameTask(() => {
    const spatialIndex = spatialIndexRef?.current
    if (!spatialIndex) return

    const mobs = mobGroupRef?.current
    if (!mobs) {
      spatialIndex.clear()
      return
    }

    let order = 0
    for (const [id, mob] of mobs) {
      const position = mob.getPosition()
      let spatialValue = mob.spatialValue
      if (!spatialValue) {
        spatialValue = fallbackSpatialValuesRef.current.get(mob)
        if (!spatialValue) {
          spatialValue = { id, mob, position }
          fallbackSpatialValuesRef.current.set(mob, spatialValue)
        }
      }
      const entry = spatialIndex.updateKeyedPoint(
        id,
        spatialValue,
        position.x,
        position.z,
      )
      if (entry) entry.order = order
      order += 1
    }
    spatialIndex.removeKeysNotIn(mobs)
  }, {
    label: 'mob-spatial-index',
    phase: FRAME_PHASES.PRE_SIMULATION,
  })

  return null
}
