import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getRenderStatsSnapshot,
  publishRenderStats,
  subscribeRenderStats,
} from './renderStatsStore'

describe('renderStatsStore', () => {
  afterEach(() => publishRenderStats(null))

  it('publishes snapshots without requiring App state', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeRenderStats(listener)
    const snapshot = { fps: 80, frameTimeMs: 12.5 }

    publishRenderStats(snapshot)

    expect(getRenderStatsSnapshot()).toBe(snapshot)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('does not notify subscribers twice for the same snapshot', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeRenderStats(listener)
    const snapshot = { fps: 120 }

    publishRenderStats(snapshot)
    publishRenderStats(snapshot)

    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})
