import { describe, expect, it } from 'vitest'
import { FRAME_PHASES, FrameScheduler } from './frameScheduler'

describe('FrameScheduler', () => {
  it('executes tasks by phase and preserves registration order inside a phase', () => {
    const scheduler = new FrameScheduler({ metricsEnabled: false })
    const calls = []

    scheduler.register(() => calls.push('simulation-a'), {
      phase: FRAME_PHASES.SIMULATION,
    })
    scheduler.register(() => calls.push('pre'), {
      phase: FRAME_PHASES.PRE_SIMULATION,
    })
    scheduler.register(() => calls.push('simulation-b'), {
      phase: FRAME_PHASES.SIMULATION,
    })
    scheduler.register(() => calls.push('post'), {
      phase: FRAME_PHASES.POST_SIMULATION,
    })

    scheduler.tick({}, 1 / 60)

    expect(calls).toEqual(['pre', 'simulation-a', 'simulation-b', 'post'])
  })

  it('unregisters tasks without affecting the remaining schedule', () => {
    const scheduler = new FrameScheduler({ metricsEnabled: false })
    const calls = []
    const unregister = scheduler.register(() => calls.push('removed'))
    scheduler.register(() => calls.push('kept'))

    unregister()
    scheduler.tick({}, 1 / 60)

    expect(calls).toEqual(['kept'])
  })

  it('aggregates hidden runtime measurements when enabled', () => {
    const scheduler = new FrameScheduler({ metricsEnabled: true })
    scheduler.register(() => {}, { label: 'simulation' })

    scheduler.tick({}, 1 / 60)
    const snapshot = scheduler.snapshot()

    expect(snapshot.enabled).toBe(true)
    expect(snapshot.taskCount).toBe(1)
    expect(snapshot.frame.samples).toBe(1)
    expect(snapshot.tasks.simulation.samples).toBe(1)
  })
})
