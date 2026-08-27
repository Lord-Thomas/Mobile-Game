export const FRAME_PHASES = Object.freeze({
  PRE_SIMULATION: -100,
  SIMULATION: 0,
  POST_SIMULATION: 100,
})

// Couvre une mesure de 15 s même sur un écran à fréquence élevée.
// Ces tableaux ne sont alimentés que lorsque les métriques runtime sont actives.
const RUNTIME_PERF_SAMPLE_LIMIT = 4096

function isRuntimePerfEnabled() {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location.search)
    return params.has('runtimeperf') || params.get('perfdiag') === 'deep' || params.get('debug') === '1'
  } catch {
    return false
  }
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function percentile(sortedSamples, ratio) {
  if (sortedSamples.length === 0) return 0
  const index = Math.min(sortedSamples.length - 1, Math.ceil(sortedSamples.length * ratio) - 1)
  return sortedSamples[Math.max(0, index)]
}

function summarizeSamples(samples) {
  if (samples.length === 0) {
    return { averageMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, totalMs: 0, samples: 0 }
  }
  const total = samples.reduce((sum, value) => sum + value, 0)
  const sorted = samples.slice().sort((left, right) => left - right)
  return {
    averageMs: total / samples.length,
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: Math.max(...samples),
    totalMs: total,
    samples: samples.length,
  }
}

export class FrameScheduler {
  constructor({ metricsEnabled = isRuntimePerfEnabled() } = {}) {
    this.metricsEnabled = metricsEnabled
    this.tasks = new Map()
    this.sortedTasks = []
    this.sortDirty = false
    this.nextTaskId = 1
    this.nextOrder = 0
    this.frameSamples = []
    this.taskSamples = new Map()
  }

  register(callback, {
    label = 'anonymous',
    phase = FRAME_PHASES.SIMULATION,
  } = {}) {
    if (typeof callback !== 'function') {
      throw new Error('FrameScheduler.register expects a callback.')
    }

    const id = this.nextTaskId
    this.nextTaskId += 1
    this.tasks.set(id, {
      id,
      label,
      phase,
      order: this.nextOrder,
      callback,
    })
    this.nextOrder += 1
    this.sortDirty = true

    return () => {
      if (this.tasks.delete(id)) this.sortDirty = true
    }
  }

  getSortedTasks() {
    if (!this.sortDirty) return this.sortedTasks
    this.sortedTasks = [...this.tasks.values()].sort((left, right) => (
      left.phase - right.phase || left.order - right.order
    ))
    this.sortDirty = false
    return this.sortedTasks
  }

  recordSample(samples, durationMs) {
    samples.push(durationMs)
    if (samples.length > RUNTIME_PERF_SAMPLE_LIMIT) {
      samples.splice(0, samples.length - RUNTIME_PERF_SAMPLE_LIMIT)
    }
  }

  runTask(task, state, delta) {
    try {
      task.callback(state, delta)
      return true
    } catch (error) {
      // Une tâche défectueuse ne doit jamais interrompre toutes les autres tâches
      // de la frame ni répéter la même exception 60 fois par seconde.
      if (this.tasks.delete(task.id)) this.sortDirty = true
      console.error(`[FrameScheduler] Tâche désactivée après une erreur (${task.label}).`, error)
      return false
    }
  }

  tick(state, delta) {
    const tasks = this.getSortedTasks()
    if (!this.metricsEnabled) {
      tasks.forEach((task) => this.runTask(task, state, delta))
      return
    }

    const frameStart = now()
    tasks.forEach((task) => {
      const taskStart = now()
      this.runTask(task, state, delta)
      const samples = this.taskSamples.get(task.label) ?? []
      this.recordSample(samples, now() - taskStart)
      this.taskSamples.set(task.label, samples)
    })
    this.recordSample(this.frameSamples, now() - frameStart)
  }

  snapshot() {
    return {
      enabled: this.metricsEnabled,
      taskCount: this.tasks.size,
      frame: summarizeSamples(this.frameSamples),
      tasks: Object.fromEntries(
        [...this.taskSamples.entries()]
          .map(([label, samples]) => [label, summarizeSamples(samples)])
          .sort((left, right) => right[1].averageMs - left[1].averageMs),
      ),
    }
  }

  resetMetrics() {
    this.frameSamples.length = 0
    this.taskSamples.clear()
  }
}

export const gameFrameScheduler = new FrameScheduler()

if (typeof window !== 'undefined') {
  window.__gameRuntimePerf = {
    snapshot: () => gameFrameScheduler.snapshot(),
    reset: () => gameFrameScheduler.resetMetrics(),
  }
}
