const PERF_DIAGNOSTICS_VERSION = 1
const DEFAULT_EVENT_LIMIT = 8000
const FREEZE_BEFORE_MS = 2000
const FREEZE_AFTER_MS = 1000

function getNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function getMode() {
  if (typeof window === 'undefined') {
    return { enabled: false, react: false, deep: false, value: null }
  }

  try {
    const params = new URLSearchParams(window.location.search)
    const value = params.get('perfdiag')
    if (value == null || value === '0' || value === 'false') {
      return { enabled: false, react: false, deep: false, value }
    }
    const normalized = value.toLowerCase()
    return {
      enabled: true,
      react: normalized === 'react' || normalized === 'deep',
      deep: normalized === 'deep',
      value: normalized || '1',
    }
  } catch {
    return { enabled: false, react: false, deep: false, value: null }
  }
}

const mode = getMode()
const events = []
const freezes = []
const activeSpans = new Map()
let nextSpanId = 1
let nextFreezeId = 1

function cloneData(value, depth = 0) {
  if (value == null || typeof value !== 'object') return value
  if (depth > 4) return '[max-depth]'
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => cloneData(entry, depth + 1))

  const out = {}
  Object.entries(value).slice(0, 80).forEach(([key, entry]) => {
    if (typeof entry === 'function') return
    out[key] = cloneData(entry, depth + 1)
  })
  return out
}

function pushEntry(entry) {
  if (!mode.enabled) return null
  const next = {
    t: getNow(),
    ...entry,
  }
  events.push(next)
  if (events.length > DEFAULT_EVENT_LIMIT) {
    events.splice(0, events.length - DEFAULT_EVENT_LIMIT)
  }
  return next
}

function getFrameSeverity(durationMs) {
  if (durationMs > 250) return 'major-freeze'
  if (durationMs > 100) return 'freeze'
  if (durationMs > 50) return 'stutter'
  if (durationMs > 33) return 'slow-frame'
  return null
}

function getNearbyEntries(start, end) {
  return events.filter((entry) => entry.t >= start && entry.t <= end)
}

function getNotableContext(capture) {
  const entries = capture.events || getNearbyEntries(capture.start, capture.end)
  return entries
    .filter((entry) => (
      entry.type !== 'frame' ||
      entry.severity === 'stutter' ||
      entry.severity === 'freeze' ||
      entry.severity === 'major-freeze'
    ))
    .sort((left, right) => {
      const leftScore = Number(left.durationMs ?? left.duration ?? 0)
      const rightScore = Number(right.durationMs ?? right.duration ?? 0)
      return rightScore - leftScore
    })
    .slice(0, 8)
}

function getFreezeSignals(capture) {
  const entries = capture.events || getNearbyEntries(capture.start, capture.end)
  const freezeTime = capture.freeze?.t ?? 0
  const sortByDuration = (left, right) => Number(right.data?.durationMs ?? right.durationMs ?? 0) - Number(left.data?.durationMs ?? left.durationMs ?? 0)
  const sortByDistance = (left, right) => Math.abs(left.t - freezeTime) - Math.abs(right.t - freezeTime)
  const longTasks = entries
    .filter((entry) => entry.type === 'browser:long-task')
    .sort(sortByDuration)
    .slice(0, 5)
  const reactCommits = entries
    .filter((entry) => entry.type === 'react:commit')
    .sort(sortByDuration)
    .slice(0, 5)
  const assetEvents = entries
    .filter((entry) => entry.type === 'asset:start' || entry.type === 'asset:end' || entry.type === 'asset:error')
    .sort(sortByDistance)
    .slice(0, 8)
  const frameEvents = entries.filter((entry) => entry.type === 'frame' && entry.renderer)
  const firstRenderer = frameEvents[0]?.renderer ?? null
  const freezeRenderer = capture.freeze?.renderer ?? null
  const lastRenderer = frameEvents[frameEvents.length - 1]?.renderer ?? null

  return {
    longTasks,
    reactCommits,
    assetEvents,
    rendererDelta: firstRenderer && freezeRenderer
      ? {
          calls: (freezeRenderer.calls ?? 0) - (firstRenderer.calls ?? 0),
          triangles: (freezeRenderer.triangles ?? 0) - (firstRenderer.triangles ?? 0),
          textures: (freezeRenderer.textures ?? 0) - (firstRenderer.textures ?? 0),
          geometries: (freezeRenderer.geometries ?? 0) - (firstRenderer.geometries ?? 0),
          programs: (freezeRenderer.programs ?? 0) - (firstRenderer.programs ?? 0),
        }
      : null,
    rendererEndDelta: freezeRenderer && lastRenderer
      ? {
          calls: (lastRenderer.calls ?? 0) - (freezeRenderer.calls ?? 0),
          triangles: (lastRenderer.triangles ?? 0) - (freezeRenderer.triangles ?? 0),
          textures: (lastRenderer.textures ?? 0) - (freezeRenderer.textures ?? 0),
          geometries: (lastRenderer.geometries ?? 0) - (freezeRenderer.geometries ?? 0),
          programs: (lastRenderer.programs ?? 0) - (freezeRenderer.programs ?? 0),
        }
      : null,
  }
}

function formatMs(value) {
  return `${Math.round(Number(value) || 0)} ms`
}

function formatNumber(value) {
  if (!Number.isFinite(Number(value))) return '-'
  return Math.round(Number(value)).toLocaleString('fr-FR')
}

function describeRenderer(renderer) {
  if (!renderer) return null
  const parts = []
  if (renderer.calls != null) parts.push(`draw calls ${formatNumber(renderer.calls)}`)
  if (renderer.triangles != null) parts.push(`triangles ${formatNumber(renderer.triangles)}`)
  if (renderer.textures != null) parts.push(`textures ${formatNumber(renderer.textures)}`)
  if (renderer.geometries != null) parts.push(`geometries ${formatNumber(renderer.geometries)}`)
  if (renderer.programs != null) parts.push(`programs ${formatNumber(renderer.programs)}`)
  return parts.length ? parts.join(', ') : null
}

function describeDelta(delta) {
  if (!delta) return null
  const parts = []
  if (delta.calls) parts.push(`draw calls ${delta.calls > 0 ? '+' : ''}${formatNumber(delta.calls)}`)
  if (delta.triangles) parts.push(`triangles ${delta.triangles > 0 ? '+' : ''}${formatNumber(delta.triangles)}`)
  if (delta.textures) parts.push(`textures ${delta.textures > 0 ? '+' : ''}${formatNumber(delta.textures)}`)
  if (delta.geometries) parts.push(`geometries ${delta.geometries > 0 ? '+' : ''}${formatNumber(delta.geometries)}`)
  if (delta.programs) parts.push(`programs ${delta.programs > 0 ? '+' : ''}${formatNumber(delta.programs)}`)
  return parts.length ? parts.join(', ') : null
}

function buildFreezeSummary(capture) {
  const freeze = capture.freeze
  const context = freeze.context || {}
  const zone = context.zone ?? '-'
  const phase = context.phase ?? context.transition ?? 'runtime'
  const step = context.transitionStep ?? context.transition ?? phase
  const signals = getFreezeSignals(capture)
  const lines = [
    `[PERF ${freeze.severity?.toUpperCase?.() ?? 'FREEZE'}] ${formatMs(freeze.durationMs)}`,
    `Zone : ${zone}`,
    `Phase : ${phase}`,
    `Step : ${step}`,
    `Time : ${formatMs(freeze.t)}`,
  ]

  const renderer = describeRenderer(freeze.renderer)
  if (renderer) lines.push(`Renderer : ${renderer}`)
  const rendererBefore = describeDelta(signals.rendererDelta)
  if (rendererBefore) lines.push(`Renderer delta avant freeze : ${rendererBefore}`)
  const rendererAfter = describeDelta(signals.rendererEndDelta)
  if (rendererAfter) lines.push(`Renderer delta apres freeze : ${rendererAfter}`)

  const suspected = []
  signals.longTasks.forEach((entry) => {
    suspected.push(`Long task : ${formatMs(entry.data?.durationMs)} @ ${formatMs(entry.data?.start ?? entry.t)} ${entry.data?.source ?? ''}`.trim())
  })
  signals.reactCommits.forEach((entry) => {
    suspected.push(`React commit ${entry.data?.id ?? '?'} (${entry.data?.phase ?? '?'}) : ${formatMs(entry.data?.durationMs)}`)
  })
  signals.assetEvents.forEach((entry) => {
    const url = entry.data?.url ?? '?'
    const label = entry.type === 'asset:start' ? 'Asset start' : entry.type === 'asset:end' ? 'Asset end' : 'Asset error'
    const duration = entry.data?.durationMs != null ? ` : ${formatMs(entry.data.durationMs)}` : ''
    suspected.push(`${label}${duration} : ${url}`)
  })

  if (suspected.length > 0) {
    lines.push('', 'Causes proches :')
    suspected.slice(0, 10).forEach((line, index) => {
      lines.push(`${index + 1}. ${line}`)
    })
  }

  const nearby = getNotableContext(capture)
  if (nearby.length > 0) {
    lines.push('', 'Contexte proche :')
    nearby.forEach((entry, index) => {
      const duration = entry.durationMs ?? entry.duration
      const label = entry.name || entry.type || 'event'
      const details = duration != null ? ` : ${formatMs(duration)}` : ''
      const zoneInfo = entry.context?.zone || entry.data?.zone || ''
      lines.push(`${index + 1}. ${label}${details}${zoneInfo ? ` (${zoneInfo})` : ''}`)
    })
  }

  lines.push('', 'Hypothese :')
  if (signals.longTasks.length > 0) {
    lines.push('Freeze correle a une ou plusieurs long tasks main thread proches.')
  } else if (signals.reactCommits.length > 0) {
    lines.push('Freeze correle a un ou plusieurs commits React proches.')
  } else if (signals.assetEvents.length > 0) {
    lines.push('Freeze proche de chargements/assets Three.js. Verifie les assets actifs dans export().')
  } else {
    lines.push('Freeze runtime detecte. Utilise window.__perfDiagnostics.export() pour analyser les evenements autour de cette frame.')
  }
  return lines.join('\n')
}

function finalizeFreezeCapture(id) {
  const capture = freezes.find((entry) => entry.id === id)
  if (!capture || capture.finalized) return
  capture.finalized = true
  capture.events = getNearbyEntries(capture.start, capture.end).map((entry) => cloneData(entry))
  capture.summary = buildFreezeSummary(capture)

  if (mode.deep) {
    console.groupCollapsed(capture.summary.split('\n')[0])
    console.log(capture.summary)
    console.table(capture.events.slice(-40))
    console.groupEnd()
  } else {
    console.warn(capture.summary)
  }
}

function startFreezeCapture(freeze) {
  const id = nextFreezeId
  nextFreezeId += 1
  const capture = {
    id,
    start: freeze.t - FREEZE_BEFORE_MS,
    end: freeze.t + FREEZE_AFTER_MS,
    finalized: false,
    freeze: cloneData(freeze),
    events: [],
    summary: '',
  }
  freezes.push(capture)
  if (freezes.length > 80) freezes.splice(0, freezes.length - 80)

  if (typeof window !== 'undefined') {
    window.setTimeout(() => finalizeFreezeCapture(id), FREEZE_AFTER_MS)
  } else {
    finalizeFreezeCapture(id)
  }
}

function event(type, data = {}) {
  return pushEntry({ type, data: cloneData(data) })
}

function mark(name, data = {}) {
  if (!mode.enabled) return null
  try { performance.mark?.(`perfdiag:${name}`) } catch { /* ignore mark errors */ }
  return pushEntry({ type: 'mark', name, data: cloneData(data) })
}

function span(name, startOrData = {}, endTime = null, data = {}) {
  if (!mode.enabled) {
    return { end: () => null }
  }

  if (Number.isFinite(startOrData) && Number.isFinite(endTime)) {
    return pushEntry({
      type: 'span',
      name,
      start: startOrData,
      end: endTime,
      durationMs: endTime - startOrData,
      data: cloneData(data),
    })
  }

  const id = nextSpanId
  nextSpanId += 1
  const start = getNow()
  activeSpans.set(id, { name, start, data: cloneData(startOrData) })
  return {
    id,
    end(extra = {}) {
      const active = activeSpans.get(id)
      if (!active) return null
      activeSpans.delete(id)
      const end = getNow()
      return pushEntry({
        type: 'span',
        name: active.name,
        start: active.start,
        end,
        durationMs: end - active.start,
        data: cloneData({ ...active.data, ...extra }),
      })
    },
  }
}

function time(name, fn, data = {}) {
  const active = span(name, data)
  try {
    return fn()
  } finally {
    active.end()
  }
}

async function timeAsync(name, fn, data = {}) {
  const active = span(name, data)
  try {
    return await fn()
  } finally {
    active.end()
  }
}

function snapshot(name = 'snapshot', data = {}) {
  return pushEntry({ type: 'snapshot', name, data: cloneData(data) })
}

function recordFrame(data = {}) {
  if (!mode.enabled) return null
  const durationMs = Number(data.durationMs ?? 0)
  const severity = getFrameSeverity(durationMs)
  const entry = pushEntry({
    type: 'frame',
    severity,
    durationMs,
    context: cloneData(data.context ?? {}),
    renderer: cloneData(data.renderer ?? null),
  })
  if (!entry || !severity) return entry

  if (severity === 'freeze' || severity === 'major-freeze') {
    startFreezeCapture(entry)
  } else if (mode.deep) {
    console.debug(`[perfdiag] ${severity}: ${formatMs(durationMs)}`, entry)
  }
  return entry
}

function exportData() {
  return {
    version: PERF_DIAGNOSTICS_VERSION,
    mode,
    generatedAt: new Date().toISOString(),
    events: events.map((entry) => cloneData(entry)),
    freezes: freezes.map((entry) => cloneData(entry)),
    activeSpans: Array.from(activeSpans.values()).map((entry) => cloneData(entry)),
  }
}

function summary() {
  if (!mode.enabled) return 'Perf diagnostics inactive. Ajoute ?perfdiag=1, ?perfdiag=react ou ?perfdiag=deep a l URL.'
  if (freezes.length === 0) {
    const stutters = events.filter((entry) => entry.type === 'frame' && entry.severity === 'stutter').length
    const slowFrames = events.filter((entry) => entry.type === 'frame' && entry.severity === 'slow-frame').length
    return [
      '[PERF SUMMARY]',
      `Events : ${events.length}`,
      `Slow frames : ${slowFrames}`,
      `Stutters : ${stutters}`,
      'Freezes : 0',
    ].join('\n')
  }

  return freezes
    .slice(-5)
    .map((capture) => capture.summary || buildFreezeSummary(capture))
    .join('\n\n---\n\n')
}

function clear() {
  events.length = 0
  freezes.length = 0
  activeSpans.clear()
  nextSpanId = 1
  nextFreezeId = 1
}

export function isPerfDiagnosticsEnabled() {
  return mode.enabled
}

export function getPerfDiagnosticsMode() {
  return mode
}

export const perfDiagnostics = {
  mode,
  event,
  mark,
  span,
  time,
  timeAsync,
  snapshot,
  recordFrame,
  export: exportData,
  summary,
  clear,
}

if (typeof window !== 'undefined') {
  window.__perfDiagnostics = perfDiagnostics
}
