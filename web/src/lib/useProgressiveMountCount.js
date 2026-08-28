import { useEffect, useRef, useState } from 'react'

const DEFAULT_STUTTER_THRESHOLD_MS = 34
const DEFAULT_FREEZE_THRESHOLD_MS = 80

export function getProgressiveMountStartingCount(currentCount, total, initialCount) {
  const normalizedTotal = Math.max(0, Math.floor(total))
  const clampedCount = Math.min(Math.max(0, currentCount), normalizedTotal)
  return clampedCount === 0 && normalizedTotal > 0
    ? Math.min(normalizedTotal, Math.max(1, Math.floor(initialCount)))
    : clampedCount
}

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
  onAdvance = null,
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
  const onAdvanceRef = useRef(onAdvance)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    onAdvanceRef.current = onAdvance
    onCompleteRef.current = onComplete
  }, [onAdvance, onComplete])

  useEffect(() => {
    if (!enabled) {
      countRef.current = normalizedTotal
      return undefined
    }

    const startingCount = getProgressiveMountStartingCount(
      countRef.current,
      normalizedTotal,
      initialCount,
    )
    if (startingCount !== countRef.current) {
      countRef.current = startingCount
      setCount(startingCount)
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
      const previousCount = countRef.current
      const nextCount = Math.min(
        normalizedTotal,
        previousCount + Math.max(1, Math.floor(batchSize)),
      )
      onAdvanceRef.current?.({
        previousCount,
        nextCount,
        total: normalizedTotal,
        frameGapMs: frameGap,
      })
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
