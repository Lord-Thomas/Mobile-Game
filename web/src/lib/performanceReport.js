const PERFORMANCE_REPORT_VERSION = 2

function finite(value, fallback = null) {
  return Number.isFinite(value) ? value : fallback
}

function cloneRecord(value) {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, finite(entry, entry)]),
  )
}

function readEnvironment() {
  if (typeof window === 'undefined') return {}
  const nav = typeof navigator === 'undefined' ? {} : navigator
  const memory = performance?.memory
  return {
    userAgent: nav.userAgent ?? null,
    hardwareConcurrency: finite(nav.hardwareConcurrency),
    deviceMemoryGb: finite(nav.deviceMemory),
    viewport: {
      width: finite(window.innerWidth),
      height: finite(window.innerHeight),
      devicePixelRatio: finite(window.devicePixelRatio),
    },
    jsHeap: memory
      ? {
          usedBytes: finite(memory.usedJSHeapSize),
          totalBytes: finite(memory.totalJSHeapSize),
          limitBytes: finite(memory.jsHeapSizeLimit),
        }
      : null,
  }
}

function summarizeDiagnostics(diagnostics) {
  if (!diagnostics) return null
  return {
    mode: diagnostics.mode ?? null,
    window: diagnostics.window ?? null,
    eventCount: diagnostics.events?.length ?? 0,
    freezeCount: diagnostics.freezes?.length ?? 0,
    droppedEventCount: finite(diagnostics.droppedEventCount, 0),
    droppedFreezeCount: finite(diagnostics.droppedFreezeCount, 0),
    truncatedBeforeWindow: diagnostics.truncatedBeforeWindow === true,
    recentFreezes: (diagnostics.freezes ?? []).slice(-5).map((capture) => ({
      severity: capture.freeze?.severity ?? null,
      durationMs: finite(capture.freeze?.durationMs),
      zone: capture.freeze?.context?.zone ?? null,
      phase: capture.freeze?.context?.phase ?? null,
      summary: capture.summary ?? null,
    })),
  }
}

export function createPerformanceReport({
  label = 'Mesure sans nom',
  stats,
  rendererInfo = null,
  quality = null,
  scheduler = null,
  diagnostics = null,
  environment = readEnvironment(),
  generatedAt = new Date().toISOString(),
} = {}) {
  if (!stats) throw new Error('createPerformanceReport requires render stats.')

  return {
    version: PERFORMANCE_REPORT_VERSION,
    generatedAt,
    label,
    measurement: {
      epoch: finite(stats.measurementEpoch),
      startedAtMs: finite(stats.measurementStartedAt),
      endedAtMs: finite(stats.measurementEndedAt),
      durationMs: (
        Number.isFinite(stats.measurementStartedAt) &&
        Number.isFinite(stats.measurementEndedAt)
      )
        ? Math.max(0, stats.measurementEndedAt - stats.measurementStartedAt)
        : null,
    },
    environment: {
      ...environment,
      renderer: rendererInfo,
      quality,
    },
    frame: {
      windowSeconds: finite(stats.stableWindowSeconds),
      fps: finite(stats.stableFps ?? stats.fps),
      onePercentLowFps: finite(stats.onePercentLowFps),
      medianMs: finite(stats.stableMedianFrameTimeMs),
      p95Ms: finite(stats.stableP95FrameTimeMs),
      p99Ms: finite(stats.stableP99FrameTimeMs),
      worstMs: finite(stats.stableMaxFrameTimeMs),
      variationPercent: finite(stats.fpsVariationPercent),
    },
    render: {
      drawCalls: finite(stats.drawCalls),
      triangles: finite(stats.triangles),
      textures: finite(stats.textures),
      geometries: finite(stats.geometries),
      programs: finite(stats.programs),
      dpr: finite(stats.dpr),
      drawingBuffer: {
        width: finite(stats.drawingBufferWidth),
        height: finite(stats.drawingBufferHeight),
      },
      drawCallsByCategory: cloneRecord(stats.drawCallsByCategory),
      trianglesByCategory: cloneRecord(stats.trianglesByCategory),
      categoryCountsAreEstimates: true,
    },
    runtime: scheduler,
    diagnostics: summarizeDiagnostics(diagnostics),
  }
}

export function getPerformanceReportFilename(report) {
  const stamp = String(report?.generatedAt ?? new Date().toISOString())
    .replace(/[:.]/g, '-')
  const slug = String(report?.label ?? 'mesure')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'mesure'
  return `performance-${slug}-${stamp}.json`
}

export function serializePerformanceReport(report) {
  return JSON.stringify(report, null, 2)
}
