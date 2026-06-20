import {
  MAP_MONSTER_SPAWNERS as generatedMonsterSpawners,
  MAP_OBJECT_PLACEMENTS as generatedPlacements,
} from './mapObjects.generated'

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

export const MONSTER_SPAWNER_TYPES = {
  mushroom: {
    id: 'mushroom',
    name: 'Champignon',
  },
  skeleton: {
    id: 'skeleton',
    name: 'Squelette',
  },
}

export const MONSTER_SPAWNER_TYPE_IDS = Object.keys(MONSTER_SPAWNER_TYPES)

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

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
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

export function normalizeMonsterSpawner(spawner, index = 0) {
  const monsterType = MONSTER_SPAWNER_TYPES[spawner?.monsterType]?.id ?? 'mushroom'
  const position = normalizePosition(spawner?.position)
  const diameter = clampNumber(asFiniteNumber(spawner?.diameter, 12), 2, 80)

  return {
    id: typeof spawner?.id === 'string' && spawner.id.trim()
      ? spawner.id
      : `monster_spawner_${index + 1}`,
    monsterType,
    position,
    diameter,
  }
}

export const MAP_MONSTER_SPAWNERS = generatedMonsterSpawners.map(normalizeMonsterSpawner)
