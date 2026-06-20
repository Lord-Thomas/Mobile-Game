import { MAP_OBJECT_PLACEMENTS as generatedPlacements } from './mapObjects.generated'

export const MAP_OBJECT_CATALOG = {
  skeleton_tower: {
    id: 'skeleton_tower',
    name: 'Skeleton tower',
    modelUrl: '/models/map/skeleton_tower/model.glb',
    targetHeightMeters: 7.2,
    colliderRadius: 1.35,
    selectionRadius: 1.55,
    hitRadius: 1.9,
    hitHeightMeters: 7.4,
    defaultScale: 1,
    thumbnailLabel: 'Tour',
  },
}

export const MAP_OBJECT_LIBRARY = ['skeleton_tower']

function asFiniteNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizePosition(position) {
  if (!Array.isArray(position)) return [0, 0, 0]
  return [
    asFiniteNumber(position[0]),
    asFiniteNumber(position[1]),
    asFiniteNumber(position[2]),
  ]
}

export function normalizeMapObjectPlacement(placement, index = 0) {
  const objectId = MAP_OBJECT_CATALOG[placement?.objectId]?.id ?? 'skeleton_tower'
  const catalogItem = MAP_OBJECT_CATALOG[objectId]

  return {
    id: typeof placement?.id === 'string' && placement.id.trim()
      ? placement.id
      : `${objectId}_${index + 1}`,
    objectId,
    position: normalizePosition(placement?.position),
    rotationY: asFiniteNumber(placement?.rotationY),
    scale: Math.max(0.2, asFiniteNumber(placement?.scale, catalogItem.defaultScale ?? 1)),
  }
}

export const MAP_OBJECT_PLACEMENTS = generatedPlacements.map(normalizeMapObjectPlacement)
