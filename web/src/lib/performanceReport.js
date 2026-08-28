const PERFORMANCE_REPORT_VERSION = 7
const HITCH_THRESHOLDS_MS = Object.freeze({
  hitch: 25,
  stutter: 40,
  severeStutter: 60,
})
const HITCH_SIGNAL_WINDOW_MS = 250
const REACT_CORRELATION_WINDOW_MS = 16.7
const PLACEABLE_CORRELATION_WINDOW_MS = 1500
const MAP_ASSET_CORRELATION_WINDOW_MS = 2000
const MAX_REPORTED_HITCHES = 8
const MAX_HITCH_SIGNALS = 6

function finite(value, fallback = null) {
  return Number.isFinite(value) ? value : fallback
}

function cloneRecord(value) {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, finite(entry, entry)]),
  )
}

function readDuration(value) {
  const duration = Number(value?.durationMs ?? value?.duration ?? value?.data?.durationMs)
  return Number.isFinite(duration) ? duration : null
}

function getHitchSeverity(durationMs) {
  if (durationMs >= HITCH_THRESHOLDS_MS.severeStutter) return 'severe-stutter'
  if (durationMs >= HITCH_THRESHOLDS_MS.stutter) return 'stutter'
  return 'hitch'
}

function summarizeHitchContext(context) {
  if (!context || typeof context !== 'object') return null
  const summary = {
    zone: context.zone ?? null,
    phase: context.phase ?? null,
    transition: context.transition ?? null,
    transitionStep: context.transitionStep ?? null,
  }
  return Object.values(summary).some((value) => value != null) ? summary : null
}

function isUsefulHitchSignal(entry) {
  if (!entry || entry.type === 'frame') return false
  if (
    entry.type === 'browser:long-task' ||
    entry.type === 'react:commit' ||
    entry.type === 'asset:start' ||
    entry.type === 'asset:end' ||
    entry.type === 'asset:error'
  ) return true

  const durationMs = readDuration(entry)
  if (entry.type === 'span' && durationMs >= 4) return true
  return /transition|stream|warmup|zone|load|placeable/i.test(`${entry.type ?? ''} ${entry.name ?? ''}`)
}

function summarizeHitchSignal(entry, hitchTime) {
  const data = entry.data && typeof entry.data === 'object' ? entry.data : {}
  const time = finite(entry.t)
  return {
    type: entry.type ?? null,
    name: entry.name ?? null,
    id: data.id ?? null,
    offsetMs: Number.isFinite(time) && Number.isFinite(hitchTime)
      ? finite(time - hitchTime)
      : null,
    durationMs: readDuration(entry),
    source: data.source ?? null,
    phase: data.phase ?? null,
    url: data.url ?? null,
    previousCount: finite(data.previousCount),
    nextCount: finite(data.nextCount),
    total: finite(data.total),
    frameGapMs: finite(data.frameGapMs),
    objects: Array.isArray(data.objects) ? data.objects.slice(0, 8) : null,
  }
}

function getPlaceableBatchesNear(placeableEvents, hitchTime) {
  if (!Number.isFinite(hitchTime)) return []
  return placeableEvents
    .filter((entry) => (
      Number.isFinite(entry?.t) &&
      Math.abs(entry.t - hitchTime) <= PLACEABLE_CORRELATION_WINDOW_MS
    ))
    .sort((left, right) => Math.abs(left.t - hitchTime) - Math.abs(right.t - hitchTime))
    .slice(0, 8)
    .map((entry) => summarizeHitchSignal(entry, hitchTime))
}

function getMapAssetEventsNear(mapAssetEvents, hitchTime) {
  if (!Number.isFinite(hitchTime)) return []
  return mapAssetEvents
    .filter((entry) => (
      Number.isFinite(entry?.t) &&
      Math.abs(entry.t - hitchTime) <= MAP_ASSET_CORRELATION_WINDOW_MS
    ))
    .sort((left, right) => Math.abs(left.t - hitchTime) - Math.abs(right.t - hitchTime))
    .slice(0, 12)
    .map((entry) => summarizeHitchSignal(entry, hitchTime))
}

function getReactCommitsNear(reactCommitEvents, hitchTime) {
  if (!Number.isFinite(hitchTime)) return []
  const closestBySubtree = new Map()

  reactCommitEvents.forEach((entry) => {
    if (!Number.isFinite(entry?.t)) return
    const offsetMs = entry.t - hitchTime
    if (Math.abs(offsetMs) > REACT_CORRELATION_WINDOW_MS) return
    const id = entry.data?.id
    if (typeof id !== 'string' || id.length === 0) return

    const current = closestBySubtree.get(id)
    if (!current || Math.abs(offsetMs) < Math.abs(current.t - hitchTime)) {
      closestBySubtree.set(id, entry)
    }
  })

  return Array.from(closestBySubtree.values())
    .sort((left, right) => Math.abs(left.t - hitchTime) - Math.abs(right.t - hitchTime))
    .map((entry) => summarizeHitchSignal(entry, hitchTime))
}

function summarizeReactCorrelations(analyzedHitches) {
  const bySubtree = new Map()
  let hitchesWithReactCommit = 0

  analyzedHitches.forEach(({ durationMs, reactCommits }) => {
    if (reactCommits.length > 0) hitchesWithReactCommit += 1
    reactCommits.forEach((commit) => {
      const current = bySubtree.get(commit.id) ?? {
        id: commit.id,
        hitchCount: 0,
        worstHitchMs: 0,
        renderSampleCount: 0,
        totalRenderMs: 0,
        maxRenderMs: 0,
      }
      current.hitchCount += 1
      current.worstHitchMs = Math.max(current.worstHitchMs, durationMs)
      if (Number.isFinite(commit.durationMs)) {
        current.renderSampleCount += 1
        current.totalRenderMs += commit.durationMs
        current.maxRenderMs = Math.max(current.maxRenderMs, commit.durationMs)
      }
      bySubtree.set(commit.id, current)
    })
  })

  return {
    windowMs: REACT_CORRELATION_WINDOW_MS,
    hitchesWithReactCommit,
    hitchesWithoutReactCommit: analyzedHitches.length - hitchesWithReactCommit,
    bySubtree: Array.from(bySubtree.values())
      .map((entry) => ({
        id: entry.id,
        hitchCount: entry.hitchCount,
        worstHitchMs: entry.worstHitchMs,
        averageRenderMs: entry.renderSampleCount > 0
          ? entry.totalRenderMs / entry.renderSampleCount
          : null,
        maxRenderMs: entry.renderSampleCount > 0 ? entry.maxRenderMs : null,
      }))
      .sort((left, right) => right.hitchCount - left.hitchCount || right.worstHitchMs - left.worstHitchMs),
  }
}

function summarizeHitches(events = []) {
  const frameEvents = events
    .map((entry) => ({ entry, durationMs: readDuration(entry) }))
    .filter(({ entry, durationMs }) => entry?.type === 'frame' && durationMs != null)
  const hitches = frameEvents.filter(({ durationMs }) => durationMs >= HITCH_THRESHOLDS_MS.hitch)
  const reactCommitEvents = events.filter((entry) => entry?.type === 'react:commit')
  const placeableEvents = events.filter((entry) => entry?.type === 'placeables:reveal')
  const mapAssetEvents = events.filter((entry) => /^map-asset:/.test(entry?.type ?? ''))
  const analyzedHitches = hitches.map(({ entry, durationMs }) => ({
    entry,
    durationMs,
    reactCommits: getReactCommitsNear(reactCommitEvents, finite(entry.t)),
    placeableBatches: getPlaceableBatchesNear(placeableEvents, finite(entry.t)),
    mapAssets: getMapAssetEventsNear(mapAssetEvents, finite(entry.t)),
  }))
  const top = analyzedHitches
    .slice()
    .sort((left, right) => right.durationMs - left.durationMs || Number(left.entry.t ?? 0) - Number(right.entry.t ?? 0))
    .slice(0, MAX_REPORTED_HITCHES)
    .map(({ entry, durationMs, reactCommits, placeableBatches, mapAssets }) => {
      const hitchTime = finite(entry.t)
      const nearbySignals = events
        .filter((candidate) => {
          if (!isUsefulHitchSignal(candidate)) return false
          if (!Number.isFinite(hitchTime) || !Number.isFinite(candidate?.t)) return false
          return Math.abs(candidate.t - hitchTime) <= HITCH_SIGNAL_WINDOW_MS
        })
        .sort((left, right) => {
          const durationDelta = (readDuration(right) ?? 0) - (readDuration(left) ?? 0)
          if (durationDelta !== 0) return durationDelta
          return Math.abs(left.t - hitchTime) - Math.abs(right.t - hitchTime)
        })
        .slice(0, MAX_HITCH_SIGNALS)
        .map((signal) => summarizeHitchSignal(signal, hitchTime))

      return {
        timeMs: hitchTime,
        durationMs,
        severity: getHitchSeverity(durationMs),
        context: summarizeHitchContext(entry.context),
        renderer: entry.renderer ?? null,
        reactCommits,
        placeableBatches,
        mapAssets,
        nearbySignals,
      }
    })

  return {
    thresholdsMs: { ...HITCH_THRESHOLDS_MS },
    counts: {
      atLeast25Ms: hitches.length,
      atLeast40Ms: frameEvents.filter(({ durationMs }) => durationMs >= HITCH_THRESHOLDS_MS.stutter).length,
      atLeast60Ms: frameEvents.filter(({ durationMs }) => durationMs >= HITCH_THRESHOLDS_MS.severeStutter).length,
    },
    worstMs: hitches.length > 0 ? Math.max(...hitches.map(({ durationMs }) => durationMs)) : null,
    reactCorrelations: summarizeReactCorrelations(analyzedHitches),
    top,
  }
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
  const events = diagnostics.events ?? []
  return {
    mode: diagnostics.mode ?? null,
    window: diagnostics.window ?? null,
    eventCount: events.length,
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
    hitches: summarizeHitches(events),
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
    gpu: stats.gpu ?? null,
    resources: stats.resources ?? null,
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
