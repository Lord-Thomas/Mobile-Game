const DEFAULT_SAMPLE_LIMIT = 4096
const DEFAULT_PENDING_LIMIT = 8

function percentile(sortedSamples, ratio) {
  if (sortedSamples.length === 0) return null
  const index = Math.min(sortedSamples.length - 1, Math.ceil(sortedSamples.length * ratio) - 1)
  return sortedSamples[Math.max(0, index)]
}

export function summarizeGpuSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return {
      averageMs: null,
      medianMs: null,
      p95Ms: null,
      p99Ms: null,
      maxMs: null,
      samples: 0,
    }
  }

  const sorted = samples.slice().sort((left, right) => left - right)
  const total = samples.reduce((sum, value) => sum + value, 0)
  return {
    averageMs: total / samples.length,
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted.at(-1),
    samples: samples.length,
  }
}

export class WebGlGpuFrameTimer {
  constructor(context, {
    sampleLimit = DEFAULT_SAMPLE_LIMIT,
    pendingLimit = DEFAULT_PENDING_LIMIT,
  } = {}) {
    this.context = context ?? null
    this.extension = this.context?.getExtension?.('EXT_disjoint_timer_query_webgl2') ?? null
    this.supported = Boolean(
      this.extension &&
      this.context?.createQuery &&
      this.context?.beginQuery &&
      this.context?.endQuery &&
      this.context?.getQueryParameter,
    )
    this.sampleLimit = sampleLimit
    this.pendingLimit = pendingLimit
    this.samples = []
    this.pending = []
    this.active = null
    this.generation = 0
    this.disjointCount = 0
    this.droppedFrameCount = 0
    this.failed = false
  }

  deleteQuery(query) {
    try {
      this.context?.deleteQuery?.(query)
    } catch {
      // Une requête de diagnostic ne doit jamais perturber le rendu.
    }
  }

  discardPending() {
    this.pending.forEach(({ query }) => this.deleteQuery(query))
    this.pending.length = 0
  }

  collectCompleted() {
    if (!this.supported || this.failed || this.pending.length === 0) return

    try {
      const disjoint = Boolean(this.context.getParameter(this.extension.GPU_DISJOINT_EXT))
      if (disjoint) {
        this.disjointCount += 1
        this.discardPending()
        return
      }

      const remaining = []
      this.pending.forEach((entry) => {
        const available = this.context.getQueryParameter(
          entry.query,
          this.context.QUERY_RESULT_AVAILABLE,
        )
        if (!available) {
          remaining.push(entry)
          return
        }

        const elapsedNanoseconds = this.context.getQueryParameter(
          entry.query,
          this.context.QUERY_RESULT,
        )
        this.deleteQuery(entry.query)
        if (entry.generation !== this.generation || !Number.isFinite(elapsedNanoseconds)) return

        this.samples.push(elapsedNanoseconds / 1_000_000)
        if (this.samples.length > this.sampleLimit) {
          this.samples.splice(0, this.samples.length - this.sampleLimit)
        }
      })
      this.pending = remaining
    } catch {
      this.failed = true
      this.discardPending()
    }
  }

  beginFrame() {
    if (!this.supported || this.failed || this.active) return false
    this.collectCompleted()
    if (this.pending.length >= this.pendingLimit) {
      this.droppedFrameCount += 1
      return false
    }

    let query = null
    try {
      query = this.context.createQuery()
      if (!query) return false
      this.context.beginQuery(this.extension.TIME_ELAPSED_EXT, query)
      this.active = { query, generation: this.generation }
      return true
    } catch {
      this.failed = true
      if (query) this.deleteQuery(query)
      return false
    }
  }

  endFrame() {
    if (!this.active) return
    const entry = this.active
    this.active = null
    try {
      this.context.endQuery(this.extension.TIME_ELAPSED_EXT)
      if (this.supported && !this.failed) this.pending.push(entry)
      else this.deleteQuery(entry.query)
    } catch {
      this.failed = true
      this.deleteQuery(entry.query)
    }
  }

  reset() {
    this.generation += 1
    this.samples.length = 0
    this.disjointCount = 0
    this.droppedFrameCount = 0
  }

  snapshot() {
    this.collectCompleted()
    return {
      supported: this.supported,
      failed: this.failed,
      ...summarizeGpuSamples(this.samples),
      pendingSamples: this.pending.length + (this.active ? 1 : 0),
      disjointCount: this.disjointCount,
      droppedFrameCount: this.droppedFrameCount,
    }
  }

  dispose() {
    if (this.active) {
      try {
        this.context.endQuery(this.extension.TIME_ELAPSED_EXT)
      } catch {
        // Le contexte peut déjà être perdu pendant le démontage.
      }
      this.deleteQuery(this.active.query)
      this.active = null
    }
    this.discardPending()
  }
}
