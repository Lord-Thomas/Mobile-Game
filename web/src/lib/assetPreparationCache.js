const preparedAssetNamespaces = new Map()

function getNamespace(namespace) {
  const existing = preparedAssetNamespaces.get(namespace)
  if (existing) return existing

  const cache = new Map()
  preparedAssetNamespaces.set(namespace, cache)
  return cache
}

/**
 * Stores CPU-side preparation results (merged geometry, bounds, fit transform...)
 * for the whole session. Loader caches only avoid downloading/parsing a file again;
 * this cache also avoids repeating expensive scene traversal for every instance.
 */
export function getOrCreatePreparedAsset(namespace, key, prepare) {
  const cache = getNamespace(namespace)
  if (cache.has(key)) return cache.get(key)

  const prepared = prepare()
  cache.set(key, prepared)
  return prepared
}

export function clearPreparedAssetCache(namespace = null) {
  if (namespace === null) {
    preparedAssetNamespaces.clear()
    return
  }
  preparedAssetNamespaces.delete(namespace)
}

export function getPreparedAssetCacheSnapshot() {
  return Object.fromEntries(
    [...preparedAssetNamespaces.entries()].map(([namespace, cache]) => [
      namespace,
      { entries: cache.size },
    ]),
  )
}

