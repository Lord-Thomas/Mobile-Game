const entries = new Map()

function createAbortError() {
  const error = new Error('Request aborted')
  error.name = 'AbortError'
  return error
}

function consumeWithSignal(promise, signal) {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(createAbortError())

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(createAbortError())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort)
    })
  })
}

/**
 * Mutualise les lectures identiques entre plusieurs objets 3D.
 * L'annulation d'un composant n'annule pas la requête partagée des autres.
 */
export function loadSharedRequest(
  key,
  loader,
  {
    signal = null,
    successTtlMs = 5 * 60 * 1000,
    failureTtlMs = 30 * 1000,
  } = {},
) {
  const now = Date.now()
  const existing = entries.get(key)
  if (existing?.value !== undefined && existing.expiresAt > now) {
    return consumeWithSignal(Promise.resolve(existing.value), signal)
  }
  if (existing?.error && existing.retryAt > now) {
    return consumeWithSignal(Promise.reject(existing.error), signal)
  }
  if (existing?.promise) {
    return consumeWithSignal(existing.promise, signal)
  }

  const entry = { promise: null, value: undefined, expiresAt: 0, error: null, retryAt: 0 }
  entry.promise = Promise.resolve()
    .then(loader)
    .then((value) => {
      entry.promise = null
      entry.value = value
      entry.expiresAt = Date.now() + successTtlMs
      entry.error = null
      entry.retryAt = 0
      return value
    })
    .catch((error) => {
      entry.promise = null
      entry.value = undefined
      entry.expiresAt = 0
      entry.error = error
      entry.retryAt = Date.now() + failureTtlMs
      throw error
    })
  entries.set(key, entry)
  return consumeWithSignal(entry.promise, signal)
}

export function clearSharedRequestCache() {
  entries.clear()
}
