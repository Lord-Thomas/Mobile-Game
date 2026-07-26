import { describe, expect, it, vi } from 'vitest'
import { AnimationMixerRegistry } from './animationMixerRegistry'

describe('AnimationMixerRegistry', () => {
  it('updates every registered mixer from one registry pass', () => {
    const registry = new AnimationMixerRegistry()
    const first = { update: vi.fn() }
    const second = { update: vi.fn() }
    registry.register(first)
    registry.register(second)

    registry.update(1 / 60)

    expect(first.update).toHaveBeenCalledWith(1 / 60)
    expect(second.update).toHaveBeenCalledWith(1 / 60)
    expect(registry.size).toBe(2)
  })

  it('stops updating a mixer after it is unregistered', () => {
    const registry = new AnimationMixerRegistry()
    const mixer = { update: vi.fn() }
    const unregister = registry.register(mixer)

    unregister()
    registry.update(1 / 60)

    expect(mixer.update).not.toHaveBeenCalled()
    expect(registry.size).toBe(0)
  })
})
