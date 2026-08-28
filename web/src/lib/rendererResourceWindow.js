const RESOURCE_KEYS = ['textures', 'geometries', 'programs']

function finiteCount(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

export function readRendererResourceCounts(renderer) {
  return {
    textures: finiteCount(renderer?.info?.memory?.textures),
    geometries: finiteCount(renderer?.info?.memory?.geometries),
    programs: finiteCount(Array.isArray(renderer?.info?.programs) ? renderer.info.programs.length : 0),
  }
}

export function createRendererResourceWindow(initialCounts) {
  const start = { ...initialCounts }
  return {
    start,
    end: { ...start },
    peak: { ...start },
    delta: { textures: 0, geometries: 0, programs: 0 },
    samples: 1,
  }
}

export function recordRendererResourceCounts(window, counts) {
  const next = window ?? createRendererResourceWindow(counts)
  next.end = { ...counts }
  next.samples += 1
  RESOURCE_KEYS.forEach((key) => {
    next.peak[key] = Math.max(next.peak[key], counts[key])
    next.delta[key] = counts[key] - next.start[key]
  })
  return next
}

export function cloneRendererResourceWindow(window) {
  if (!window) return null
  return {
    start: { ...window.start },
    end: { ...window.end },
    peak: { ...window.peak },
    delta: { ...window.delta },
    samples: window.samples,
  }
}
