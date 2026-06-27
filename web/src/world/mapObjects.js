import * as generatedMapObjects from './mapObjects.generated'
import { MAP_OBJECT_DEFINITIONS } from './mapObjectLibrary'
import { AUTHORED_TREES } from './outdoorData'
import { getTerrainHeight } from './terrain/terrainGeometry'
import { estimateTreeHeight } from './trees/proceduralTreeConfig'
import {
  getRuntimeTreeLibrary,
  getTreeMapObjectEntries,
  getTreeMapObjectId,
} from './trees/treeLibrary'

const generatedPlacements = Array.isArray(generatedMapObjects.MAP_OBJECT_PLACEMENTS)
  ? generatedMapObjects.MAP_OBJECT_PLACEMENTS
  : []
const generatedMonsterSpawners = Array.isArray(generatedMapObjects.MAP_MONSTER_SPAWNERS)
  ? generatedMapObjects.MAP_MONSTER_SPAWNERS
  : []
const generatedHasAuthoringState = generatedMapObjects.MAP_OBJECTS_ARE_AUTHORING_STATE === true
const PLAYER_REFERENCE_HEIGHT_METERS = 1.63
const PLAYER_REFERENCE_HEIGHT_WORLD_UNITS = 2.25
const WORLD_UNITS_PER_METER = PLAYER_REFERENCE_HEIGHT_WORLD_UNITS / PLAYER_REFERENCE_HEIGHT_METERS
const MAGIC_SKULL_DISCOVERY_TOWER_Y_OFFSET = 0.14
export const MAGIC_SKULL_DISCOVERY_OBJECT_ID = 'magic_skull_discovery'

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
  [MAGIC_SKULL_DISCOVERY_OBJECT_ID]: {
    id: MAGIC_SKULL_DISCOVERY_OBJECT_ID,
    name: 'Crane necromancien',
    modelUrl: '/models/weapons/magic_skull_necromancer.glb',
    targetHeightMeters: 0.15,
    colliderRadius: 0,
    selectionRadius: 0.55,
    hitRadius: 0.8,
    hitHeightMeters: 0.8,
    defaultScale: 1,
    thumbnailLabel: 'Crane',
  },
  // PNJ de quête : plaçable depuis l'éditeur de map comme n'importe quel objet.
  // Le modèle (FBX) est rendu par MapObjectPlaceables ; l'interaction (marqueur,
  // proximité, dialogue) est gérée séparément via QUEST_NPC_OBJECT_ID (App.jsx).
  village_quest_npc: {
    id: 'village_quest_npc',
    name: 'PNJ de quete',
    modelUrl: '/models/pnj/pnj-01.fbx',
    targetHeightMeters: 1.36,
    colliderRadius: 0,
    selectionRadius: 0.6,
    hitRadius: 0.85,
    hitHeightMeters: 1.36,
    defaultScale: 1,
    thumbnailLabel: 'PNJ',
  },
}

function sanitizeObjectId(value, fallback = '') {
  return String(value ?? fallback)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
}

function normalizeMapObjectDefinition(definition) {
  const id = sanitizeObjectId(definition?.id)
  const modelUrl = typeof definition?.modelUrl === 'string' ? definition.modelUrl.trim() : ''
  if (!id || !modelUrl) return null

  const targetHeightMeters = asFiniteNumber(definition.targetHeightMeters, 1.5)
  const colliderRadius = asFiniteNumber(definition.colliderRadius, 0)
  const selectionRadius = asFiniteNumber(definition.selectionRadius, colliderRadius || 0.85)
  const hitRadius = asFiniteNumber(definition.hitRadius, Math.max(selectionRadius, colliderRadius, 0.9))
  const hitHeightMeters = asFiniteNumber(definition.hitHeightMeters, targetHeightMeters)

  return {
    id,
    name: typeof definition.name === 'string' && definition.name.trim()
      ? definition.name.trim()
      : id,
    modelUrl,
    targetHeightMeters: Math.max(0.05, targetHeightMeters),
    colliderRadius: Math.max(0, colliderRadius),
    selectionRadius: Math.max(0.15, selectionRadius),
    hitRadius: Math.max(0.15, hitRadius),
    hitHeightMeters: Math.max(0.05, hitHeightMeters),
    defaultScale: Math.max(0.05, asFiniteNumber(definition.defaultScale, 1)),
    thumbnailLabel: typeof definition.thumbnailLabel === 'string' && definition.thumbnailLabel.trim()
      ? definition.thumbnailLabel.trim()
      : 'Objet',
  }
}

function createCustomMapObjectCatalog() {
  return MAP_OBJECT_DEFINITIONS.reduce((catalog, definition) => {
    const item = normalizeMapObjectDefinition(definition)
    if (item) catalog[item.id] = item
    return catalog
  }, {})
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

// Built once and cached. Rebuilding it (which re-estimates every tree's height
// and returns fresh object references) used to run on every getMapObjectCatalogItem
// call — i.e. several times per object per render — which both wasted work and
// defeated downstream memoization (a fresh catalogItem ref forced the procedural
// tree geometry to be regenerated on every re-render). The catalog is static at
// runtime, so cache it.
let catalogCache = null
export function getMapObjectCatalog() {
  if (!catalogCache) {
    catalogCache = {
      ...BASE_MAP_OBJECT_CATALOG,
      ...createCustomMapObjectCatalog(),
      ...createTreeMapObjectCatalog(),
    }
  }
  return catalogCache
}

export function getMapObjectCatalogItem(objectId) {
  return getMapObjectCatalog()[objectId] ?? null
}

function resolveMapObjectId(objectId) {
  const catalog = getMapObjectCatalog()
  if (catalog[objectId]) return objectId
  if (typeof objectId !== 'string') return null

  const withoutGeneratedSuffix = objectId
    .replace(/_3d_model$/i, '')
    .replace(/_model$/i, '')

  return catalog[withoutGeneratedSuffix] ? withoutGeneratedSuffix : null
}

export function getMapObjectLibrary() {
  return Object.keys(getMapObjectCatalog())
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
  skeleton_archer: {
    id: 'skeleton_archer',
    name: 'Archer squelette',
  },
  skeleton_mage: {
    id: 'skeleton_mage',
    name: 'Mage squelette',
  },
}

export const MONSTER_SPAWNER_TYPE_IDS = Object.keys(MONSTER_SPAWNER_TYPES)
const DEFAULT_SPAWNER_POPULATION_MAX = 6
const DEFAULT_SPAWNER_RESPAWN_SECONDS = 30
const DEFAULT_SPAWNER_MIN_DISTANCE = 5
const DEFAULT_SPAWNER_HEIGHT_OFFSET = 0

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

function normalizeSpawnerVariants(variants, fallbackMonsterType) {
  const source = Array.isArray(variants) && variants.length
    ? variants
    : [{ monsterType: fallbackMonsterType, weight: 100 }]
  const merged = new Map()

  source.forEach((variant) => {
    const monsterType = MONSTER_SPAWNER_TYPES[variant?.monsterType]?.id
      ?? MONSTER_SPAWNER_TYPES[variant?.type]?.id
      ?? null
    if (!monsterType) return
    const weight = clampNumber(asFiniteNumber(variant?.weight, 0), 0, 100)
    if (weight <= 0) return
    merged.set(monsterType, (merged.get(monsterType) ?? 0) + weight)
  })

  if (merged.size === 0) {
    const fallback = MONSTER_SPAWNER_TYPES[fallbackMonsterType]?.id ?? 'mushroom'
    merged.set(fallback, 100)
  }

  return [...merged.entries()].map(([monsterType, weight]) => ({
    monsterType,
    weight: Math.round(weight),
  }))
}

export function normalizeMapObjectPlacement(placement, index = 0) {
  const objectId = resolveMapObjectId(placement?.objectId) ?? 'skeleton_tower'
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

function createAuthoredTreeMapObjectPlacements() {
  const treeLibrary = getRuntimeTreeLibrary()

  return AUTHORED_TREES.map((tree) => {
    const variant = treeLibrary[tree.variantId]
    const baseScale = Math.max(0.001, variant?.config?.scale ?? tree.config.scale ?? 1)
    const x = tree.config.position.x
    const z = tree.config.position.z

    return {
      id: tree.id,
      objectId: getTreeMapObjectId(tree.variantId),
      position: [x, getTerrainHeight(x, z), z],
      rotationY: tree.config.rotationY ?? 0,
      scale: (tree.config.scale ?? baseScale) / baseScale,
    }
  })
}

function getInitialMapObjectPlacements() {
  if (generatedHasAuthoringState) return ensureMagicSkullDiscoveryPlacement(generatedPlacements)

  const generatedIds = new Set(generatedPlacements.map((placement) => placement?.id))
  const authoredTreePlacements = createAuthoredTreeMapObjectPlacements()
    .filter((placement) => !generatedIds.has(placement.id))

  return ensureMagicSkullDiscoveryPlacement([...authoredTreePlacements, ...generatedPlacements])
}

function ensureMagicSkullDiscoveryPlacement(placements) {
  if (placements.some((placement) => placement?.objectId === MAGIC_SKULL_DISCOVERY_OBJECT_ID)) return placements

  const towerPlacement = placements.find((placement) => placement?.objectId === 'skeleton_tower')
  if (!towerPlacement) return placements

  const [x = 0, savedY, z = 0] = towerPlacement.position ?? []
  const scale = Math.max(0.05, asFiniteNumber(towerPlacement.scale, 1))
  const baseY = asFiniteNumber(savedY, getTerrainHeight(x, z))
  const towerHeight = (BASE_MAP_OBJECT_CATALOG.skeleton_tower.targetHeightMeters ?? 7.2) * WORLD_UNITS_PER_METER * scale

  return [
    ...placements,
    {
      id: 'magic_skull_discovery_tower',
      objectId: MAGIC_SKULL_DISCOVERY_OBJECT_ID,
      position: [x, baseY + towerHeight + MAGIC_SKULL_DISCOVERY_TOWER_Y_OFFSET, z],
      rotationY: Math.PI,
      scale: 1,
    },
  ]
}

export const MAP_OBJECT_PLACEMENTS = getInitialMapObjectPlacements().map(normalizeMapObjectPlacement)

export function normalizeMonsterSpawner(spawner, index = 0) {
  const monsterType = MONSTER_SPAWNER_TYPES[spawner?.monsterType]?.id ?? 'mushroom'
  const position = normalizePosition(spawner?.position)
  const heightOffset = clampNumber(
    asFiniteNumber(spawner?.heightOffset, position[1] - getTerrainHeight(position[0], position[2]) || DEFAULT_SPAWNER_HEIGHT_OFFSET),
    -10,
    30,
  )
  const radius = clampNumber(
    asFiniteNumber(spawner?.radius, asFiniteNumber(spawner?.diameter, 24) * 0.5),
    1,
    80,
  )
  const variants = normalizeSpawnerVariants(spawner?.variants, monsterType)

  return {
    id: typeof spawner?.id === 'string' && spawner.id.trim()
      ? spawner.id
      : `monster_spawner_${index + 1}`,
    monsterType: MONSTER_SPAWNER_TYPES[spawner?.monsterType]?.id ?? variants[0]?.monsterType ?? 'mushroom',
    position: [position[0], getTerrainHeight(position[0], position[2]) + heightOffset, position[2]],
    heightOffset,
    radius,
    diameter: radius * 2,
    populationMax: Math.round(clampNumber(asFiniteNumber(spawner?.populationMax, DEFAULT_SPAWNER_POPULATION_MAX), 1, 50)),
    respawnSeconds: Math.round(clampNumber(asFiniteNumber(spawner?.respawnSeconds, DEFAULT_SPAWNER_RESPAWN_SECONDS), 1, 600)),
    minDistance: clampNumber(asFiniteNumber(spawner?.minDistance, DEFAULT_SPAWNER_MIN_DISTANCE), 0, 40),
    patrol: spawner?.patrol === undefined ? true : spawner.patrol !== false,
    aggressive: spawner?.aggressive === undefined ? true : spawner.aggressive !== false,
    variants,
  }
}

export const MAP_MONSTER_SPAWNERS = generatedMonsterSpawners.map(normalizeMonsterSpawner)
