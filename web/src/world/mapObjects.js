import {
  MAP_MONSTER_SPAWNERS as generatedMonsterSpawners,
  MAP_OBJECT_PLACEMENTS as generatedPlacements,
} from './mapObjects.generated'
import { estimateTreeHeight } from './trees/proceduralTreeConfig'
import { getTreeMapObjectEntries, getTreeMapObjectLibrary } from './trees/treeLibrary'

const BASE_MAP_OBJECT_CATALOG = {
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

function createTreeMapObjectCatalog() {
  return getTreeMapObjectEntries().reduce((catalog, { objectId, tree }) => {
    const heightWorldUnits = estimateTreeHeight(tree.config)
    catalog[objectId] = {
      id: objectId,
      type: 'tree',
      name: `Arbre - ${tree.name}`,
      treeId: tree.id,
      treeConfig: tree.config,
      heightWorldUnits,
      colliderRadius: Math.max(0.65, heightWorldUnits * 0.11),
      selectionRadius: Math.max(0.8, heightWorldUnits * 0.13),
      hitRadius: Math.max(0.9, heightWorldUnits * 0.16),
      hitHeightWorldUnits: Math.max(2.2, heightWorldUnits),
      defaultScale: 1,
      thumbnailLabel: 'Arbre',
    }
    return catalog
  }, {})
}

export function getMapObjectCatalog() {
  return {
    ...BASE_MAP_OBJECT_CATALOG,
    ...createTreeMapObjectCatalog(),
  }
}

export function getMapObjectCatalogItem(objectId) {
  return getMapObjectCatalog()[objectId] ?? null
}

export function getMapObjectLibrary() {
  return ['skeleton_tower', ...getTreeMapObjectLibrary()]
}

export const MAP_OBJECT_CATALOG = getMapObjectCatalog()
export const MAP_OBJECT_LIBRARY = getMapObjectLibrary()

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
  const objectId = getMapObjectCatalogItem(placement?.objectId)?.id ?? 'skeleton_tower'
  const catalogItem = getMapObjectCatalogItem(objectId)

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
