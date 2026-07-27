import { Object3D, PerspectiveCamera } from 'three'
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

  it('skips only distant mixers that are safely outside the camera view', () => {
    const registry = new AnimationMixerRegistry()
    const camera = new PerspectiveCamera(50, 1, 0.1, 500)
    camera.position.set(0, 2, 0)
    camera.lookAt(0, 2, -1)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()

    const visibleMixer = { update: vi.fn() }
    const offscreenMixer = { update: vi.fn() }
    const visibleRoot = new Object3D()
    const offscreenRoot = new Object3D()
    visibleRoot.position.set(0, 0, -100)
    offscreenRoot.position.set(100, 0, 0)
    visibleRoot.updateMatrixWorld()
    offscreenRoot.updateMatrixWorld()
    registry.register(visibleMixer, { root: visibleRoot })
    registry.register(offscreenMixer, { root: offscreenRoot })

    registry.update(1 / 60, { camera })

    expect(visibleMixer.update).toHaveBeenCalledWith(1 / 60)
    expect(offscreenMixer.update).not.toHaveBeenCalled()
    expect(registry.snapshot()).toEqual({ updated: 1, skipped: 1, total: 2 })
  })

  it('keeps nearby offscreen mixers animated to preserve immediate camera turns', () => {
    const registry = new AnimationMixerRegistry()
    const camera = new PerspectiveCamera(50, 1, 0.1, 500)
    camera.position.set(0, 2, 0)
    camera.lookAt(0, 2, -1)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()

    const mixer = { update: vi.fn() }
    const root = new Object3D()
    root.position.set(10, 0, 0)
    root.updateMatrixWorld()
    registry.register(mixer, { root })

    registry.update(1 / 60, { camera })

    expect(mixer.update).toHaveBeenCalledWith(1 / 60)
  })

  it('does not animate roots hidden by their hierarchy', () => {
    const registry = new AnimationMixerRegistry()
    const mixer = { update: vi.fn() }
    const parent = new Object3D()
    const root = new Object3D()
    parent.visible = false
    parent.add(root)
    registry.register(mixer, { root })

    registry.update(1 / 60)

    expect(mixer.update).not.toHaveBeenCalled()
    expect(registry.snapshot()).toEqual({ updated: 0, skipped: 1, total: 1 })
  })
})
