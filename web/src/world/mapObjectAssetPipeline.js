import { perfDiagnostics } from '../lib/perfDiagnostics'

const assetRecords = new Map()
const subscribers = new Set()
let revision = 0

function now() {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function notify() {
  revision += 1
  subscribers.forEach((subscriber) => subscriber())
}

function getOrCreateRecord(entry) {
  const existing = assetRecords.get(entry.url)
  if (existing) return existing
  const record = {
    ...entry,
    status: 'queued',
    startedAt: null,
    decodedAt: null,
    readyAt: null,
    error: null,
  }
  assetRecords.set(entry.url, record)
  return record
}

function diagnosticObjects(record) {
  return record.placements.slice(0, 12).map((placement) => ({
    id: placement.id,
    objectId: placement.objectId,
    assetUrl: record.url,
  }))
}

function eventData(record, extra = {}) {
  return {
    source: 'map-objects',
    url: record.url,
    extension: record.extension,
    objectIds: record.objectIds,
    objects: diagnosticObjects(record),
    ...extra,
  }
}

export function collectMapObjectAssetEntries(objects = [], getCatalogItem) {
  const byUrl = new Map()

  objects.forEach((placement) => {
    const catalogItem = getCatalogItem?.(placement.objectId)
    const url = typeof catalogItem?.modelUrl === 'string' ? catalogItem.modelUrl : ''
    if (!url) return

    const existing = byUrl.get(url) ?? {
      url,
      extension: url.split('?')[0].split('.').pop()?.toLowerCase() ?? '',
      objectIds: [],
      placements: [],
    }
    if (!existing.objectIds.includes(placement.objectId)) {
      existing.objectIds.push(placement.objectId)
    }
    existing.placements.push({ id: placement.id, objectId: placement.objectId })
    byUrl.set(url, existing)
  })

  return Array.from(byUrl.values())
}

export function subscribeMapObjectAssetPipeline(subscriber) {
  subscribers.add(subscriber)
  return () => subscribers.delete(subscriber)
}

export function getMapObjectAssetPipelineRevision() {
  return revision
}

export function getMapObjectAssetStatus(url) {
  return assetRecords.get(url)?.status ?? 'queued'
}

export function isMapObjectAssetReady(url) {
  return !url || getMapObjectAssetStatus(url) === 'ready'
}

export function isMapObjectAssetSettled(url) {
  const status = getMapObjectAssetStatus(url)
  return status === 'ready' || status === 'error'
}

export function beginMapObjectAsset(entry) {
  const record = getOrCreateRecord(entry)
  if (record.status !== 'queued') return false
  record.status = 'loading'
  record.startedAt = now()
  perfDiagnostics.event('map-asset:start', eventData(record))
  notify()
  return true
}

export function markMapObjectAssetDecoded(entry) {
  const record = getOrCreateRecord(entry)
  if (record.status === 'decoded' || record.status === 'ready') return false
  const decodedAt = now()
  record.status = 'decoded'
  record.decodedAt = decodedAt
  perfDiagnostics.event('map-asset:decoded', eventData(record, {
    durationMs: record.startedAt == null ? null : decodedAt - record.startedAt,
  }))
  notify()
  return true
}

export function markMapObjectAssetReady(entry) {
  const record = getOrCreateRecord(entry)
  if (record.status === 'ready') return false
  const readyAt = now()
  record.status = 'ready'
  record.readyAt = readyAt
  perfDiagnostics.event('map-asset:reveal', eventData(record, {
    durationMs: record.startedAt == null ? null : readyAt - record.startedAt,
    decodeToRevealMs: record.decodedAt == null ? null : readyAt - record.decodedAt,
  }))
  notify()
  return true
}

export function markMapObjectAssetError(entry, error) {
  const record = getOrCreateRecord(entry)
  if (record.status === 'error') return false
  const failedAt = now()
  record.status = 'error'
  record.error = error instanceof Error ? error.message : String(error ?? 'unknown error')
  perfDiagnostics.event('map-asset:error', eventData(record, {
    durationMs: record.startedAt == null ? null : failedAt - record.startedAt,
    error: record.error,
  }))
  notify()
  return true
}

export function getMapObjectAssetPipelineSnapshot(entries = []) {
  const statuses = entries.map((entry) => getMapObjectAssetStatus(entry.url))
  return {
    total: entries.length,
    queued: statuses.filter((status) => status === 'queued').length,
    loading: statuses.filter((status) => status === 'loading').length,
    decoded: statuses.filter((status) => status === 'decoded').length,
    ready: statuses.filter((status) => status === 'ready').length,
    errors: statuses.filter((status) => status === 'error').length,
  }
}

export function resetMapObjectAssetPipelineForTests() {
  assetRecords.clear()
  revision = 0
  subscribers.clear()
}
