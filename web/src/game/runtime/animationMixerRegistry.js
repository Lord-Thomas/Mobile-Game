import { Vector3 } from 'three'

const OFFSCREEN_CULL_MIN_DISTANCE = 55
const OFFSCREEN_CULL_MIN_DISTANCE_SQ = OFFSCREEN_CULL_MIN_DISTANCE * OFFSCREEN_CULL_MIN_DISTANCE
const OFFSCREEN_CULL_VIEW_MARGIN = 1.35

function isHierarchyVisible(root) {
  let object = root
  while (object) {
    if (object.visible === false) return false
    object = object.parent
  }
  return true
}

function shouldUpdateEntry(entry, camera) {
  const root = entry.root
  if (!root) return true
  if (!isHierarchyVisible(root)) return false
  if (!camera?.position || typeof root.getWorldPosition !== 'function') return true

  root.getWorldPosition(entry.worldPosition)
  if (entry.worldPosition.distanceToSquared(camera.position) <= OFFSCREEN_CULL_MIN_DISTANCE_SQ) {
    return true
  }

  entry.projectedPosition.copy(entry.worldPosition).project(camera)
  return (
    entry.projectedPosition.z >= -1
    && entry.projectedPosition.z <= 1
    && Math.abs(entry.projectedPosition.x) <= OFFSCREEN_CULL_VIEW_MARGIN
    && Math.abs(entry.projectedPosition.y) <= OFFSCREEN_CULL_VIEW_MARGIN
  )
}

export class AnimationMixerRegistry {
  constructor() {
    this.entries = new Map()
    this.lastFrameStats = { updated: 0, skipped: 0, total: 0 }
  }

  register(mixer, {
    root = null,
    cullWhenOffscreen = true,
  } = {}) {
    if (!mixer || typeof mixer.update !== 'function') {
      throw new Error('AnimationMixerRegistry.register expects an animation mixer.')
    }

    this.entries.set(mixer, {
      mixer,
      root: cullWhenOffscreen ? root : null,
      worldPosition: new Vector3(),
      projectedPosition: new Vector3(),
    })
    return () => {
      this.entries.delete(mixer)
    }
  }

  update(delta, state = null) {
    let updated = 0
    let skipped = 0
    const camera = state?.camera ?? null

    this.entries.forEach((entry) => {
      if (!shouldUpdateEntry(entry, camera)) {
        skipped += 1
        return
      }
      entry.mixer.update(delta)
      updated += 1
    })

    this.lastFrameStats = {
      updated,
      skipped,
      total: this.entries.size,
    }
  }

  get size() {
    return this.entries.size
  }

  snapshot() {
    return { ...this.lastFrameStats }
  }
}

export const gameAnimationMixerRegistry = new AnimationMixerRegistry()

if (typeof window !== 'undefined') {
  window.__gameAnimationPerf = {
    snapshot: () => gameAnimationMixerRegistry.snapshot(),
  }
}
