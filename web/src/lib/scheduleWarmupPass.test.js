import { expect, it, vi } from 'vitest'
import { scheduleWarmupPass } from './scheduleWarmupPass'
function clock() {
  let id=0
  const queued=new Map()
  return {
    requestAnimationFrame: fn => { queued.set(++id,fn); return id },
    cancelAnimationFrame: key => queued.delete(key),
    tick: () => { const batch=[...queued.values()]; queued.clear(); batch.forEach(fn=>fn()) },
  }
}
it('allows retry after cancellation between frames instead of deadlocking readiness', () => {
  const frames=clock(), ref={current:false}, run=vi.fn()
  const cancel=scheduleWarmupPass(ref,run,frames)
  frames.tick(); cancel(); frames.tick()
  expect(ref.current).toBe(false)
  expect(run).not.toHaveBeenCalled()
  scheduleWarmupPass(ref,run,frames)
  frames.tick(); frames.tick()
  expect(ref.current).toBe(true)
  expect(run).toHaveBeenCalledTimes(1)
  scheduleWarmupPass(ref,run,frames)
  frames.tick(); frames.tick()
  expect(run).toHaveBeenCalledTimes(1)
})
