let currentSnapshot = null
const listeners = new Set()

export function getRenderStatsSnapshot() {
  return currentSnapshot
}

export function publishRenderStats(snapshot) {
  if (Object.is(snapshot, currentSnapshot)) return
  currentSnapshot = snapshot
  listeners.forEach((listener) => listener())
}

export function subscribeRenderStats(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
