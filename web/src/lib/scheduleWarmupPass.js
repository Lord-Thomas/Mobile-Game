// A cancelled frame must not consume the once-per-session warmup latch.
export function scheduleWarmupPass(completedRef, run, frames = window) {
  let cancelled = false
  let first = 0
  let second = 0
  first = frames.requestAnimationFrame(() => {
    second = frames.requestAnimationFrame(() => {
      if (cancelled || completedRef.current) return
      completedRef.current = true
      run()
    })
  })
  return () => {
    cancelled = true
    frames.cancelAnimationFrame(first)
    frames.cancelAnimationFrame(second)
  }
}
