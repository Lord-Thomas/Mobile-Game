import { useEffect, useRef, useState } from 'react'

const DEFAULT_STUTTER_THRESHOLD_MS = 34
const DEFAULT_FREEZE_THRESHOLD_MS = 80

/**
 * Adds React children over several committed frames. A heavy child can therefore
 * block at most its own frame instead of being multiplied by the collection size.
 * The hook slows itself down after a long frame and resumes automatically.
 */
export function useProgressiveMountCount({
  enabled = true,
  total = 0,
  initialCount = 1,
  batchSize = 1,
  stutterThresholdMs = DEFAULT_STUTTER_THRESHOLD_MS,
  freezeThresholdMs = DEFAULT_FREEZE_THRESHOLD_MS,
  onComplete = null,
}) {
  const normalizedTotal = Math.max(0, Math.floor(total))
  const getInitialCount = () => (
    enabled
      ? Math.min(normalizedTotal, Math.max(0, Math.floor(initialCount)))
      : normalizedTotal
  )
  const [count, setCount] = useState(getInitialCount)
  const countRef = useRef(count)
  const completedTotalRef = useRef(null)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    if (!enabled) {
      countRef.current = normalizedTotal
      return undefined
    }

    countRef.current = Math.min(countRef.current, normalizedTotal)
    if (countRef.current === 0 && normalizedTotal > 0) {
      countRef.current = Math.min(normalizedTotal, Math.max(1, initialCount))
    }
    let cancelled = false
    let rafId = 0
    let timeoutId = 0
    let previousFrameAt = performance.now()

    const schedule = (delayMs = 0) => {
      if (cancelled) return
      if (delayMs > 0) {
        timeoutId = window.setTimeout(() => {
          rafId = window.requestAnimationFrame(step)
        }, delayMs)
      } else {
        rafId = window.requestAnimationFrame(step)
      }
    }

    const step = (now) => {
      if (cancelled || countRef.current >= normalizedTotal) return
      const frameGap = now - previousFrameAt
      previousFrameAt = now
      const nextCount = Math.min(
        normalizedTotal,
        countRef.current + Math.max(1, Math.floor(batchSize)),
      )
      countRef.current = nextCount
      setCount(nextCount)

      if (nextCount >= normalizedTotal) return
      if (frameGap >= freezeThresholdMs) schedule(180)
      else if (frameGap >= stutterThresholdMs) schedule(60)
      else schedule()
    }

    if (countRef.current < normalizedTotal) schedule()
    return () => {
      cancelled = true
      window.cancelAnimationFrame(rafId)
      window.clearTimeout(timeoutId)
    }
  }, [
    batchSize,
    enabled,
    freezeThresholdMs,
    initialCount,
    normalizedTotal,
    stutterThresholdMs,
  ])

  const renderedCount = enabled ? Math.min(count, normalizedTotal) : normalizedTotal

  useEffect(() => {
    const complete = renderedCount >= normalizedTotal
    if (!complete || completedTotalRef.current === normalizedTotal) return
    completedTotalRef.current = normalizedTotal
    onCompleteRef.current?.({ total: normalizedTotal })
  }, [normalizedTotal, renderedCount])

  return {
    count: renderedCount,
    complete: renderedCount >= normalizedTotal,
    progress: normalizedTotal === 0 ? 1 : Math.min(1, renderedCount / normalizedTotal),
  }
}
