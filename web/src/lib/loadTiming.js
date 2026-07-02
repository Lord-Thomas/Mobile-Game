import { perfDiagnostics } from './perfDiagnostics'

// Instrumentation du temps de chargement.
//
// But : savoir EXACTEMENT ce qui prend du temps entre le boot et l'affichage du
// monde. On pose des jalons (performance.mark) aux frontières des 3 phases :
//   1. boot JS          (jsBoot → assetsStart)
//   2. téléchargement   (assetsStart → assetsLoaded)   ← réseau + parse GLB/FBX/textures
//   3. warmup shaders   (assetsLoaded → warmupEnd)      ← gl.compileAsync
//
// À la fin, reportLoadTiming() imprime un tableau lisible + les ressources réseau
// les plus lentes (Resource Timing API). Aucun coût en prod : ce sont juste des
// marks ; le report ne tourne qu'une fois, au moment où l'overlay disparaît.

const marks = []
const assetLoads = new Map()
const activeAssetIdsByUrl = new Map()
const assetUrlByLoadId = new Map()
const initialBlockingAssetIds = new Set()
const initialLoadSubscribers = new Set()
const longTasks = []
let longTaskObserverInstalled = false
let assetProfilerInstalled = false

// Sonde Long Tasks : capture chaque blocage synchrone du main thread > 50 ms
// (rendu React initial, cooking de colliders Rapier, parse FBX/GLB, etc.). C'est
// la seule façon de savoir si les ~16 s "jsBoot → assetsLoaded" sont UNE tâche
// géante (render React monolithique) ou PLEIN de tâches moyennes (physique/FBX
// par objet) — les deux appellent un fix différent. buffered:true rejoue aussi
// les tâches survenues avant l'installation de l'observer.
export function installLongTaskObserver() {
  if (longTaskObserverInstalled || typeof PerformanceObserver === 'undefined') return
  longTaskObserverInstalled = true
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const attribution = (entry.attribution || [])
          .map((a) => a.containerName || a.containerId || a.containerType || a.name)
          .filter(Boolean)
          .join(', ')
        const task = { start: entry.startTime, durée: entry.duration, source: attribution }
        longTasks.push(task)
        perfDiagnostics.event('browser:long-task', {
          start: entry.startTime,
          durationMs: entry.duration,
          source: attribution || '(self)',
        })
      }
    })
    observer.observe({ type: 'longtask', buffered: true })
  } catch {
    longTaskObserverInstalled = false
  }
}
let nextAssetLoadId = 1
let initialAssetBatchCollecting = false
let initialAssetBatchLocked = false
let initialAssetBatchForcedReady = false
let initialAssetBatchForceReason = ''
let initialAssetBatchForcedPendingUrls = []

export function markLoad(name) {
  if (typeof performance === 'undefined') return
  const t = performance.now()
  marks.push({ name, t })
  try { performance.mark(`load:${name}`) } catch { /* ignore */ }
}

function normalizeAssetUrl(url) {
  return String(url ?? '').replace(/^https?:\/\/[^/]+/, '')
}

function getAssetRecord(url) {
  const key = normalizeAssetUrl(url)
  const existing = assetLoads.get(key)
  if (existing) return existing

  const record = {
    url: key,
    starts: [],
    ends: [],
    errors: 0,
    active: 0,
    latestEnd: 0,
  }
  assetLoads.set(key, record)
  return record
}

function getActiveAssetStack(key) {
  const existing = activeAssetIdsByUrl.get(key)
  if (existing) return existing

  const stack = []
  activeAssetIdsByUrl.set(key, stack)
  return stack
}

function notifyInitialLoadSubscribers() {
  initialLoadSubscribers.forEach((listener) => {
    try { listener() } catch { /* ignore subscriber errors */ }
  })
}

export function isInitialAssetBatchReady() {
  return initialAssetBatchLocked && (initialAssetBatchForcedReady || initialBlockingAssetIds.size === 0)
}

export function startInitialAssetBatchCollection() {
  if (initialAssetBatchLocked || initialAssetBatchForcedReady) return
  initialAssetBatchCollecting = true
}

export function lockInitialAssetBatch() {
  if (initialAssetBatchLocked) return
  initialAssetBatchLocked = true
  initialAssetBatchCollecting = false
  notifyInitialLoadSubscribers()
}

export function forceInitialAssetBatchReady(reason = 'timeout') {
  if (initialAssetBatchForcedReady) return
  initialAssetBatchForcedReady = true
  initialAssetBatchForceReason = reason
  initialAssetBatchForcedPendingUrls = Array.from(initialBlockingAssetIds)
    .map((id) => assetUrlByLoadId.get(id))
    .filter(Boolean)
  initialBlockingAssetIds.clear()
  console.warn(`[loadTiming] Initial asset batch forced ready: ${reason}`)
  notifyInitialLoadSubscribers()
}

export function subscribeInitialAssetBatch(listener) {
  initialLoadSubscribers.add(listener)
  return () => {
    initialLoadSubscribers.delete(listener)
  }
}

export function getInitialAssetBatchSnapshot() {
  const pendingUrls = Array.from(initialBlockingAssetIds)
    .map((id) => assetUrlByLoadId.get(id))
    .filter(Boolean)
  return {
    locked: initialAssetBatchLocked,
    forced: initialAssetBatchForcedReady,
    forceReason: initialAssetBatchForceReason,
    pending: initialBlockingAssetIds.size,
    pendingUrls,
    forcedPendingUrls: initialAssetBatchForcedPendingUrls,
  }
}

export function installAssetLoadProfiler(manager) {
  if (!manager || assetProfilerInstalled || typeof performance === 'undefined') return
  assetProfilerInstalled = true

  const originalItemStart = manager.itemStart?.bind(manager)
  const originalItemEnd = manager.itemEnd?.bind(manager)
  const originalItemError = manager.itemError?.bind(manager)

  manager.itemStart = (url) => {
    const record = getAssetRecord(url)
    const key = record.url
    const id = nextAssetLoadId
    nextAssetLoadId += 1
    getActiveAssetStack(key).push(id)
    assetUrlByLoadId.set(id, key)
    record.starts.push(performance.now())
    perfDiagnostics.event('asset:start', {
      id,
      url: key,
      active: record.active + 1,
    })
    record.active += 1
    if (initialAssetBatchCollecting && !initialAssetBatchLocked && !initialAssetBatchForcedReady) {
      initialBlockingAssetIds.add(id)
      notifyInitialLoadSubscribers()
    }
    return originalItemStart?.(url)
  }

  manager.itemEnd = (url) => {
    const record = getAssetRecord(url)
    const key = record.url
    const stack = getActiveAssetStack(key)
    const id = stack.shift()
    if (stack.length === 0) activeAssetIdsByUrl.delete(key)
    if (id != null) assetUrlByLoadId.delete(id)
    const t = performance.now()
    record.ends.push(t)
    record.latestEnd = t
    perfDiagnostics.event('asset:end', {
      id,
      url: key,
      durationMs: id != null
        ? t - (record.starts[record.ends.length - 1] ?? t)
        : null,
      active: Math.max(0, record.active - 1),
    })
    record.active = Math.max(0, record.active - 1)
    if (id != null && initialBlockingAssetIds.delete(id)) {
      notifyInitialLoadSubscribers()
    }
    return originalItemEnd?.(url)
  }

  manager.itemError = (url) => {
    const record = getAssetRecord(url)
    record.errors += 1
    perfDiagnostics.event('asset:error', {
      url: record.url,
      errors: record.errors,
    })
    return originalItemError?.(url)
  }
}

// Attribution du coût de rendu par sous-arbre via <React.Profiler>. Accumule la
// durée de rendu réelle (actualDuration) par id, jusqu'au premier rapport, pour
// révéler QUEL sous-arbre tient le main thread pendant les ~15 s de blocage.
const renderProfiles = new Map()

export function recordRenderProfile(id, phase, actualDuration) {
  const existing = renderProfiles.get(id) || { id, commits: 0, total: 0, mountMs: 0 }
  existing.commits += 1
  existing.total += actualDuration
  if (phase === 'mount') existing.mountMs += actualDuration
  renderProfiles.set(id, existing)
  perfDiagnostics.event('react:commit', {
    id,
    phase,
    durationMs: actualDuration,
    totalMs: existing.total,
    mountMs: existing.mountMs,
    commits: existing.commits,
  })
}

function fmt(ms) {
  return `${ms.toFixed(0)} ms`
}

function withoutSortKeys(row) {
  const next = { ...row }
  delete next._d
  delete next._end
  return next
}

let reported = false

export function reportLoadTiming() {
  if (reported || typeof performance === 'undefined') return
  reported = true

  // Phases consécutives entre jalons. performance.now() est relatif au début de
  // navigation, donc la 1re marque (jsBoot) = durée HTML + bundle JS (download+parse).
  const phaseMarks = marks.filter((mark, index) => index === 0 || mark.name !== marks[index - 1].name)
  const phases = []
  if (phaseMarks.length) {
    phases.push({ phase: 'navigation → jsBoot (HTML+JS)', durée: fmt(phaseMarks[0].t) })
  }
  for (let i = 1; i < phaseMarks.length; i += 1) {
    phases.push({
      phase: `${phaseMarks[i - 1].name} → ${phaseMarks[i].name}`,
      durée: fmt(phaseMarks[i].t - phaseMarks[i - 1].t),
    })
  }

  // Temps total depuis le tout début de la navigation (téléchargement du HTML/JS inclus).
  const nav = performance.getEntriesByType?.('navigation')?.[0]
  const totalSinceNav = nav ? performance.now() - nav.startTime : null

  // Top des ressources réseau les plus lentes (durée de transfert).
  const resources = (performance.getEntriesByType?.('resource') || [])
    .map((r) => ({
      url: r.name.replace(/^https?:\/\/[^/]+/, '').slice(0, 60),
      durée: fmt(r.duration),
      ko: Math.round((r.encodedBodySize || 0) / 1024),
      _d: r.duration,
    }))
    .sort((a, b) => b._d - a._d)
    .slice(0, 12)
    .map(withoutSortKeys)

  const latestResources = (performance.getEntriesByType?.('resource') || [])
    .map((r) => ({
      url: r.name.replace(/^https?:\/\/[^/]+/, '').slice(0, 80),
      fin: fmt(r.responseEnd),
      durée: fmt(r.duration),
      ko: Math.round((r.encodedBodySize || 0) / 1024),
      initiateur: r.initiatorType,
      _end: r.responseEnd,
    }))
    .sort((a, b) => b._end - a._end)
    .slice(0, 20)
    .map(withoutSortKeys)

  const assets = Array.from(assetLoads.values())
    .flatMap((record) => record.starts.map((start, index) => {
      const end = record.ends[index]
      return {
        url: record.url.slice(0, 80),
        durée: end == null ? 'en cours' : fmt(end - start),
        début: fmt(start),
        fin: end == null ? '-' : fmt(end),
        erreurs: record.errors || '',
        _d: end == null ? Number.POSITIVE_INFINITY : end - start,
      }
    }))
    .sort((a, b) => b._d - a._d)
    .slice(0, 20)
    .map(withoutSortKeys)

  const latestAssets = Array.from(assetLoads.values())
    .flatMap((record) => record.starts.map((start, index) => {
      const end = record.ends[index]
      return {
        url: record.url.slice(0, 80),
        fin: end == null ? 'en cours' : fmt(end),
        durée: end == null ? 'en cours' : fmt(end - start),
        début: fmt(start),
        erreurs: record.errors || '',
        _end: end ?? Number.POSITIVE_INFINITY,
      }
    }))
    .sort((a, b) => b._end - a._end)
    .slice(0, 20)
    .map(withoutSortKeys)

  const pendingAssets = Array.from(assetLoads.values())
    .filter((record) => record.active > 0)
    .map((record) => ({
      url: record.url.slice(0, 80),
      actifs: record.active,
      derniersDéparts: record.starts.slice(-3).map(fmt).join(', '),
      erreurs: record.errors || '',
    }))

  const initialBatch = getInitialAssetBatchSnapshot()

  console.group('%c⏱️ Temps de chargement', 'font-weight:bold;font-size:13px')
  if (totalSinceNav != null) console.log(`Total (navigation → monde affiché) : ${fmt(totalSinceNav)}`)
  // Version texte (lisible dans toute console) + console.table (jolie dans DevTools).
  phases.forEach((p) => console.log(`  ${p.phase.padEnd(34)} ${p.durée}`))
  console.table(phases)
  console.log('Ressources réseau les plus lentes :')
  resources.forEach((r) => console.log(`  ${String(r.ko).padStart(5)} Ko  ${r.durée.padStart(7)}  ${r.url}`))
  console.table(resources)
  console.log('Ressources réseau terminées le plus tard :')
  latestResources.forEach((r) => console.log(`  fin ${String(r.fin).padStart(8)}  ${r.url}`))
  console.table(latestResources)
  console.log('Assets Three.js les plus lents (itemStart → itemEnd) :')
  assets.forEach((a) => console.log(`  ${String(a.durée).padStart(9)}  ${a.url}`))
  console.table(assets)
  console.log('Assets Three.js terminés le plus tard :')
  latestAssets.forEach((a) => console.log(`  fin ${String(a.fin).padStart(8)}  ${a.url}`))
  console.table(latestAssets)
  console.log('Lot initial bloquant :', initialBatch)

  if (renderProfiles.size > 0) {
    const profiles = Array.from(renderProfiles.values())
      .sort((a, b) => b.total - a.total)
      .map((p) => ({
        sousArbre: p.id,
        renduTotal: fmt(p.total),
        montage: fmt(p.mountMs),
        commits: p.commits,
      }))
    console.log('Coût de rendu par sous-arbre (Profiler, actualDuration cumulée) :')
    profiles.forEach((p) => console.log(`  ${String(p.renduTotal).padStart(9)} total  (${String(p.montage).padStart(8)} montage, ${p.commits} commits)  ${p.sousArbre}`))
    console.table(profiles)
  }

  // Blocages synchrones du main thread (la cause des "trous" sans réseau).
  if (longTasks.length > 0) {
    const topLongTasks = longTasks
      .slice()
      .sort((a, b) => b.durée - a.durée)
      .slice(0, 15)
      .map((t) => ({ début: fmt(t.start), durée: fmt(t.durée), source: t.source || '(self)' }))
    const totalBlocking = longTasks.reduce((sum, t) => sum + t.durée, 0)
    console.log(`Blocages synchrones main thread (long tasks > 50 ms) : ${longTasks.length} tâches, ${fmt(totalBlocking)} cumulées`)
    topLongTasks.forEach((t) => console.log(`  début ${String(t.début).padStart(8)}  durée ${String(t.durée).padStart(8)}  ${t.source}`))
    console.table(topLongTasks)
  } else {
    console.log('Blocages synchrones main thread : aucune long task capturée (observer indisponible ?)')
  }
  if (pendingAssets.length > 0) {
    console.log('Assets Three.js encore actifs au report :')
    console.table(pendingAssets)
  }
  console.groupEnd()
}
