export const FRAME_PHASES = Object.freeze({
  PRE_SIMULATION: -100,
  SIMULATION: 0,
  POST_SIMULATION: 100,
})

const RUNTIME_PERF_SAMPLE_LIMIT = 240

function isRuntimePerfEnabled() {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location.search)
    return params.has('runtimeperf') || params.get('perfdiag') === 'deep'
  } catch {
    return false
  }
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function summarizeSamples(samples) {
  if (samples.length === 0) return { averageMs: 0, maxMs: 0, samples: 0 }
  const total = samples.reduce((sum, value) => sum + value, 0)
  return {
    averageMs: total / samples.length,
    maxMs: Math.max(...samples),
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
