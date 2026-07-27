const tasks = new Map()
const listeners = new Set()

function notify() {
  listeners.forEach((listener) => {
    try { listener() } catch { /* diagnostics must never break loading */ }
  })
}

export function resetLoadTask(id) {
  tasks.set(id, { ready: false, completedAt: null })
  notify()
}

export function completeLoadTask(id) {
  const current = tasks.get(id)
  if (current?.ready) return
  tasks.set(id, {
    ready: true,
    completedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
  })
  notify()
}

export function isLoadTaskReady(id) {
  return tasks.get(id)?.ready === true
}

export function waitForLoadTasks(ids, timeoutMs = 8000) {
  const taskIds = [...new Set(ids)].filter(Boolean)
  const getPending = () => taskIds.filter((id) => !isLoadTaskReady(id))
  const initialPending = getPending()
  if (initialPending.length === 0) {
    return Promise.resolve({ ready: true, pending: [] })
  }

  return new Promise((resolve) => {
    let settled = false
    let timeoutId = 0

    const finish = (ready) => {
      if (settled) return
      settled = true
      listeners.delete(check)
      if (timeoutId) clearTimeout(timeoutId)
      resolve({ ready, pending: getPending() })
    }
    const check = () => {
      if (getPending().length === 0) finish(true)
    }

    listeners.add(check)
    timeoutId = setTimeout(() => finish(false), timeoutMs)
  })
}

export function getLoadTaskSnapshot() {
  return Object.fromEntries(tasks)
}
