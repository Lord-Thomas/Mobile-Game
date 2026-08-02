import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { Buffer } from 'node:buffer'
import { writeFile, readFile, mkdir, readdir } from 'node:fs/promises'
import { basename, extname, join, relative, sep } from 'node:path'
import process from 'node:process'
import { generateTerrainSurfaceMask } from './scripts/generate-terrain-surface-mask.mjs'

const MAP_MODEL_EXTENSIONS = new Set(['.glb', '.gltf', '.fbx'])
const LOOT_MODEL_EXTENSIONS = new Set(['.glb', '.gltf'])
const LOOT_ICON_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'])
const RESERVED_MAP_OBJECT_IDS = new Set(['skeleton_tower', 'magic_skull_necromancer'])
const RESERVED_ENEMY_IDS = new Set(['mushroom', 'mushroom_man', 'skeleton', 'skeleton_archer', 'skeleton_mage'])
const RESERVED_ENEMY_MODEL_URLS = new Set([
  '/models/enemies/mushroom_man/model.fbx',
  '/models/enemies/mushroom_man/model.glb',
  '/models/enemies/skeleton/model.fbx',
  '/models/enemies/skeleton/model.glb',
])
const RESERVED_LOOT_MODEL_URLS = new Set([
  '/items/blue+crystal+cluster+3d+model.glb',
  '/items/bone+3d+model.glb',
  '/items/red+crystal+3d+model.glb',
  '/items/red+mushroom+3d+model.glb',
])

function sanitizeGeneratedObjectId(value) {
  return String(value ?? 'map_object')
    .trim()
    .replace(/\.[a-zA-Z0-9]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'map_object'
}

function titleFromObjectId(id) {
  return id
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeGeneratedId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value)
    ? value
    : null
}

function getSlimePetIdForLoot(id, name, existing = {}) {
  const existingSlimePetId = normalizeGeneratedId(existing.slimePetId)
  if (existingSlimePetId) return existingSlimePetId
  return /slime/i.test(`${id} ${name ?? ''}`) ? id : null
}

function getMapObjectIdFromRelativePath(relativePath) {
  const normalized = relativePath.split(sep).join('/')
  const parts = normalized.split('/')
  const filename = parts.at(-1) ?? 'map_object'
  const stem = basename(filename, extname(filename))
  const parent = parts.length > 1 ? parts.at(-2) : ''
  const sourceName = /^(model|scene|object)$/i.test(stem) && parent ? parent : stem
  return sanitizeGeneratedObjectId(sourceName)
    .replace(/_3d_model$/i, '')
    .replace(/_model$/i, '')
}

async function findMapModelFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await findMapModelFiles(fullPath))
    } else if (entry.isFile() && MAP_MODEL_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      files.push(fullPath)
    }
  }

  return files
}

async function findFilesByExtension(dir, extensions) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await findFilesByExtension(fullPath, extensions))
    } else if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) {
      files.push(fullPath)
    }
  }

  return files
}

async function findEnemyModelFiles(dir) {
  return findFilesByExtension(dir, MAP_MODEL_EXTENSIONS)
}

async function findLootModelFiles(dir) {
  return findFilesByExtension(dir, LOOT_MODEL_EXTENSIONS)
}

async function findLootIconFiles(dir) {
  return findFilesByExtension(dir, LOOT_ICON_EXTENSIONS)
}

async function readGeneratedArray(filePath, exportName) {
  try {
    const source = await readFile(filePath, 'utf8')
    const start = source.indexOf(`export const ${exportName} = `)
    if (start < 0) return []
    const jsonStart = source.indexOf('[', start)
    const jsonEnd = source.lastIndexOf(']')
    if (jsonStart < 0 || jsonEnd < jsonStart) return []
    const parsed = JSON.parse(source.slice(jsonStart, jsonEnd + 1))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function createMapObjectDefinitionsFromFiles(files, mapModelsDir) {
  const usedIds = new Set()

  return files
    .sort((a, b) => a.localeCompare(b))
    .map((file) => {
      const relativePath = relative(mapModelsDir, file)
      let id = getMapObjectIdFromRelativePath(relativePath)
      if (RESERVED_MAP_OBJECT_IDS.has(id)) return null

      const baseId = id
      let suffix = 2
      while (usedIds.has(id)) {
        id = `${baseId}_${suffix}`
        suffix += 1
      }
      usedIds.add(id)

      const publicPath = encodeURI(`/models/map/${relativePath.split(sep).join('/')}`)
      return {
        id,
        name: titleFromObjectId(id),
        modelUrl: publicPath,
        targetHeightMeters: 1.5,
        colliderRadius: 0,
        selectionRadius: 0.85,
        hitRadius: 0.95,
        hitHeightMeters: 1.5,
        defaultScale: 1,
        thumbnailLabel: 'Objet',
      }
    })
    .filter(Boolean)
}

function preferGeneratedModel(current, next) {
  if (!current) return next
  if (current.modelFormat !== 'glb' && next.modelFormat === 'glb') return next
  return current
}

function createEnemyDefinitionsFromFiles(files, enemiesDir) {
  const definitions = new Map()

  files
    .sort((a, b) => a.localeCompare(b))
    .forEach((file) => {
      const relativePath = relative(enemiesDir, file)
      const publicPath = encodeURI(`/models/enemies/${relativePath.split(sep).join('/')}`)
      if (RESERVED_ENEMY_MODEL_URLS.has(publicPath)) return

      const id = getMapObjectIdFromRelativePath(relativePath)
      if (RESERVED_ENEMY_IDS.has(id)) return

      const modelFormat = extname(file).toLowerCase() === '.fbx' ? 'fbx' : 'glb'
      definitions.set(id, preferGeneratedModel(definitions.get(id), {
        id,
        name: titleFromObjectId(id),
        modelFormat,
        modelUrl: publicPath,
        maxHp: 30,
        rewardCoins: 10,
        attackDamage: 10,
        sizeScale: 1,
        modelTargetHeight: 0.77,
        targetRadius: 0.48,
        targetHeight: 1.2,
        hudHeight: 2,
        defaultLootTable: [],
      }))
    })

  return Array.from(definitions.values())
}

function createLootItemDefinitionsFromFiles(files, itemsDir, iconFiles = [], existingDefinitions = []) {
  const definitions = new Map()
  const existingById = new Map(existingDefinitions.map((definition) => [definition?.id, definition]))
  const iconOptions = iconFiles
    .sort((a, b) => a.localeCompare(b))
    .map((file) => encodeURI(`/items/${relative(itemsDir, file).split(sep).join('/')}`))
  const modelOptions = files
    .sort((a, b) => a.localeCompare(b))
    .map((file) => encodeURI(`/items/${relative(itemsDir, file).split(sep).join('/')}`))
    .filter((model) => !RESERVED_LOOT_MODEL_URLS.has(model))

  files
    .sort((a, b) => a.localeCompare(b))
    .forEach((file) => {
      const relativePath = relative(itemsDir, file)
      const publicPath = encodeURI(`/items/${relativePath.split(sep).join('/')}`)
      if (RESERVED_LOOT_MODEL_URLS.has(publicPath)) return

      const id = getMapObjectIdFromRelativePath(relativePath)
      const existing = existingById.get(id) ?? {}
      const modelDir = relativePath.split(sep).slice(0, -1).join('/')
      const sameDirIcon = iconOptions.find((icon) => (
        modelDir ? icon.startsWith(encodeURI(`/items/${modelDir}/`)) : icon.split('/').length === 3
      ))
      const name = typeof existing.name === 'string' && existing.name.trim() ? existing.name.trim() : titleFromObjectId(id)
      const model = modelOptions.includes(existing.model) ? existing.model : publicPath
      const icon = iconOptions.includes(existing.icon) ? existing.icon : sameDirIcon ?? ''
      const slimePetId = getSlimePetIdForLoot(id, name, existing)
      definitions.set(id, {
        id,
        name,
        model,
        modelOptions,
        icon,
        iconOptions,
        emoji: '📦',
        sellPrice: Number.isFinite(Number(existing.sellPrice))
          ? Math.max(0, Math.round(Number(existing.sellPrice)))
          : 10,
        ...(slimePetId ? { slimePetId } : {}),
      })
    })

  return Array.from(definitions.values())
}

function sanitizeLootDefinitions(definitions) {
  return definitions
    .map((definition) => {
      const id = typeof definition?.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(definition.id)
        ? definition.id
        : null
      const modelOptions = Array.isArray(definition.modelOptions)
        ? definition.modelOptions.filter((model) => typeof model === 'string' && model.startsWith('/items/'))
        : []
      const model = typeof definition?.model === 'string' && modelOptions.includes(definition.model)
        ? definition.model
        : modelOptions[0] ?? null
      if (!id || !model) return null
      const iconOptions = Array.isArray(definition.iconOptions)
        ? definition.iconOptions.filter((icon) => typeof icon === 'string' && icon.startsWith('/items/'))
        : []
      const icon = typeof definition.icon === 'string' && iconOptions.includes(definition.icon)
        ? definition.icon
        : ''
      const name = typeof definition.name === 'string' && definition.name.trim()
        ? definition.name.trim().slice(0, 80)
        : titleFromObjectId(id)
      const slimePetId = getSlimePetIdForLoot(id, name, definition)

      return {
        id,
        name,
        model,
        modelOptions,
        icon,
        iconOptions,
        emoji: typeof definition.emoji === 'string' && definition.emoji.trim()
          ? definition.emoji.trim().slice(0, 8)
          : '📦',
        sellPrice: Number.isFinite(Number(definition.sellPrice))
          ? Math.min(100000, Math.max(0, Math.round(Number(definition.sellPrice))))
          : 10,
        ...(slimePetId ? { slimePetId } : {}),
      }
    })
    .filter(Boolean)
}

function saveThumbnailPlugin() {
  return {
    name: 'dev-save-assets',
    configureServer(server) {
      server.middlewares.use('/dev/art-direction', async (req, res) => {
        const directory = join(process.cwd(), '.codex')
        const filePath = join(directory, 'dev-art-direction.json')
        res.setHeader('cache-control', 'no-store')

        if (req.method === 'GET') {
          try {
            const document = await readFile(filePath, 'utf8')
            res.setHeader('content-type', 'application/json; charset=utf-8')
            res.statusCode = 200
            res.end(document)
          } catch {
            res.statusCode = 404
            res.end()
          }
          return
        }

        if (req.method !== 'PUT') {
          res.statusCode = 405
          res.end()
          return
        }

        const chunks = []
        let byteLength = 0
        req.on('data', (chunk) => {
          byteLength += chunk.length
          if (byteLength <= 512_000) chunks.push(chunk)
        })
        req.on('end', async () => {
          try {
            if (byteLength > 512_000) {
              res.statusCode = 413
              res.end('Document too large')
              return
            }
            const document = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
            if (!Array.isArray(document.presets) || document.presets.length === 0) {
              res.statusCode = 400
              res.end('Invalid art direction document')
              return
            }
            await mkdir(directory, { recursive: true })
            await writeFile(filePath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
            res.statusCode = 204
            res.end()
          } catch (error) {
            res.statusCode = 500
            res.end(error.message)
          }
        })
      })

      server.middlewares.use('/dev/save-tree-library', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        const chunks = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', async () => {
          try {
            const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
            const trees = Array.isArray(payload.trees) ? payload.trees : []
            const sanitizedTrees = trees.reduce((accumulator, tree, index) => {
              const fallbackId = `tree-${index + 1}`
              const id = typeof tree.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(tree.id)
                ? tree.id
                : fallbackId
              const name = typeof tree.name === 'string' && tree.name.trim()
                ? tree.name.trim().slice(0, 80)
                : `Arbre ${index + 1}`
              const config = tree.config && typeof tree.config === 'object' ? tree.config : {}

              accumulator[id] = { id, name, config }
              return accumulator
            }, {})
            const source = [
              `export const SAVED_TREE_LIBRARY = ${JSON.stringify(sanitizedTrees, null, 2)}`,
              '',
            ].join('\n')
            await writeFile(join(process.cwd(), 'src', 'world', 'trees', 'treeLibrary.generated.js'), source)
            res.statusCode = 200
            res.end('ok')
          } catch (err) {
            res.statusCode = 500
            res.end(err.message)
          }
        })
      })

      server.middlewares.use('/dev/save-thumbnail', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        const chunks = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', async () => {
          try {
            const objectId = req.headers['x-object-id']
            if (!objectId || !/^[a-zA-Z0-9_-]+$/.test(objectId)) {
              res.statusCode = 400; res.end('Invalid objectId'); return
            }
            const dir = join(process.cwd(), 'public', 'ui', 'object-thumbnails')
            await mkdir(dir, { recursive: true })
            await writeFile(join(dir, `${objectId}.webp`), Buffer.concat(chunks))
            res.statusCode = 200
            res.end('ok')
          } catch (err) {
            res.statusCode = 500
            res.end(err.message)
          }
        })
      })

      server.middlewares.use('/dev/import-map-models', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        try {
          const mapModelsDir = join(process.cwd(), 'public', 'models', 'map')
          await mkdir(mapModelsDir, { recursive: true })
          const files = await findMapModelFiles(mapModelsDir)
          const definitions = createMapObjectDefinitionsFromFiles(files, mapModelsDir)
          const source = [
            `export const GENERATED_MAP_OBJECT_DEFINITIONS = ${JSON.stringify(definitions, null, 2)}`,
            '',
          ].join('\n')
          await writeFile(join(process.cwd(), 'src', 'world', 'mapObjectLibrary.generated.js'), source)
          res.setHeader('content-type', 'application/json')
          res.statusCode = 200
          res.end(JSON.stringify({ imported: definitions.length }))
        } catch (err) {
          res.statusCode = 500
          res.end(err.message)
        }
      })

      server.middlewares.use('/dev/import-enemy-models', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        try {
          const enemiesDir = join(process.cwd(), 'public', 'models', 'enemies')
          await mkdir(enemiesDir, { recursive: true })
          const files = await findEnemyModelFiles(enemiesDir)
          const definitions = createEnemyDefinitionsFromFiles(files, enemiesDir)
          const source = [
            `export const GENERATED_ENEMY_DEFINITIONS = ${JSON.stringify(definitions, null, 2)}`,
            '',
          ].join('\n')
          await writeFile(join(process.cwd(), 'src', 'enemies', 'enemyDefinitions.generated.js'), source)
          res.setHeader('content-type', 'application/json')
          res.statusCode = 200
          res.end(JSON.stringify({ imported: definitions.length }))
        } catch (err) {
          res.statusCode = 500
          res.end(err.message)
        }
      })

      server.middlewares.use('/dev/import-loot-models', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        try {
          const itemsDir = join(process.cwd(), 'public', 'items')
          await mkdir(itemsDir, { recursive: true })
          const files = await findLootModelFiles(itemsDir)
          const iconFiles = await findLootIconFiles(itemsDir)
          const generatedPath = join(process.cwd(), 'src', 'items', 'itemDefinitions.generated.js')
          const existingDefinitions = await readGeneratedArray(generatedPath, 'GENERATED_ITEM_DEFINITIONS')
          const definitions = createLootItemDefinitionsFromFiles(files, itemsDir, iconFiles, existingDefinitions)
          const source = [
            `export const GENERATED_ITEM_DEFINITIONS = ${JSON.stringify(definitions, null, 2)}`,
            '',
          ].join('\n')
          await writeFile(generatedPath, source)
          res.setHeader('content-type', 'application/json')
          res.statusCode = 200
          res.end(JSON.stringify({ imported: definitions.length }))
        } catch (err) {
          res.statusCode = 500
          res.end(err.message)
        }
      })

      server.middlewares.use('/dev/save-loot-definitions', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        const chunks = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', async () => {
          try {
            const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
            const definitions = sanitizeLootDefinitions(Array.isArray(payload.definitions) ? payload.definitions : [])
            const source = [
              `export const GENERATED_ITEM_DEFINITIONS = ${JSON.stringify(definitions, null, 2)}`,
              '',
            ].join('\n')
            await writeFile(join(process.cwd(), 'src', 'items', 'itemDefinitions.generated.js'), source)
            res.setHeader('content-type', 'application/json')
            res.statusCode = 200
            res.end(JSON.stringify({ saved: definitions.length }))
          } catch (err) {
            res.statusCode = 500
            res.end(err.message)
          }
        })
      })

      server.middlewares.use('/dev/save-map-objects', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        const chunks = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', async () => {
          try {
            const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
            const placements = Array.isArray(payload.placements) ? payload.placements : []
            const spawners = Array.isArray(payload.spawners) ? payload.spawners : []
            const biomes = Array.isArray(payload.biomes) ? payload.biomes : []
            const paths = Array.isArray(payload.paths) ? payload.paths : []
            const allowedPathTypes = new Set(['dirt', 'stone', 'sand', 'gravel'])
            const sanitizedPaths = paths.map((stamp, index) => {
              const type = allowedPathTypes.has(stamp.type) ? stamp.type : 'dirt'
              const center = Array.isArray(stamp.center) ? stamp.center : [0, 0]
              const id = typeof stamp.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(stamp.id)
                ? stamp.id
                : `path_${index + 1}`
              return {
                id,
                type,
                center: [
                  Number.isFinite(Number(center[0])) ? Number(center[0]) : 0,
                  Number.isFinite(Number(center[1])) ? Number(center[1]) : 0,
                ],
                width: Number.isFinite(Number(stamp.width))
                  ? Math.min(24, Math.max(0.5, Number(stamp.width)))
                  : 3,
              }
            })
            const terrainModifications = payload.terrainModifications && typeof payload.terrainModifications === 'object'
              ? payload.terrainModifications
              : {}
            const sanitizedTerrainModifications = {}
            for (const key of Object.keys(terrainModifications)) {
              if (/^-?\d+_-?\d+$/.test(key)) {
                const val = Number(terrainModifications[key])
                if (Number.isFinite(val)) {
                  sanitizedTerrainModifications[key] = val
                }
              }
            }
            const sanitizedPlacements = placements.map((placement, index) => {
              const objectId = typeof placement.objectId === 'string' && /^[a-zA-Z0-9_-]+$/.test(placement.objectId)
                ? placement.objectId
                : null
              const position = Array.isArray(placement.position) ? placement.position : [0, 0, 0]
              const id = typeof placement.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(placement.id)
                ? placement.id
                : `${objectId ?? 'map_object'}_${index + 1}`

              if (!objectId) throw new Error(`Unknown map object at index ${index}`)

              const normalizedPlacement = {
                id,
                objectId,
                position: [
                  Number.isFinite(Number(position[0])) ? Number(position[0]) : 0,
                  Number.isFinite(Number(position[1])) ? Number(position[1]) : 0,
                  Number.isFinite(Number(position[2])) ? Number(position[2]) : 0,
                ],
                rotationY: Number.isFinite(Number(placement.rotationY)) ? Number(placement.rotationY) : 0,
                scale: Number.isFinite(Number(placement.scale)) ? Math.max(0.2, Number(placement.scale)) : 1,
              }

              if (objectId === 'summoning_altar') {
                const rawLootTable = Array.isArray(placement.lootTable) ? placement.lootTable : []
                normalizedPlacement.rewardCoins = Number.isFinite(Number(placement.rewardCoins))
                  ? Math.min(100000, Math.max(0, Math.round(Number(placement.rewardCoins))))
                  : 250
                normalizedPlacement.lootTable = rawLootTable
                  .map((entry) => ({
                    itemId: typeof entry?.itemId === 'string' && /^[a-zA-Z0-9_-]+$/.test(entry.itemId)
                      ? entry.itemId
                      : null,
                    chance: Number.isFinite(Number(entry?.chance))
                      ? Math.min(1, Math.max(0, Number(entry.chance)))
                      : 0,
                    quantity: Number.isFinite(Number(entry?.quantity))
                      ? Math.min(99, Math.max(1, Math.round(Number(entry.quantity))))
                      : 1,
                  }))
                  .filter((entry) => entry.itemId && entry.chance > 0)
              }

              return normalizedPlacement
            })
            const enemiesDir = join(process.cwd(), 'public', 'models', 'enemies')
            const itemsDir = join(process.cwd(), 'public', 'items')
            await mkdir(enemiesDir, { recursive: true })
            await mkdir(itemsDir, { recursive: true })
            const generatedEnemyDefinitions = createEnemyDefinitionsFromFiles(await findEnemyModelFiles(enemiesDir), enemiesDir)
            const generatedItemDefinitions = createLootItemDefinitionsFromFiles(await findLootModelFiles(itemsDir), itemsDir)
            const allowedMonsterTypes = new Set([
              'skeleton',
              'mushroom',
              'skeleton_archer',
              'skeleton_mage',
              ...generatedEnemyDefinitions.map((definition) => definition.id),
            ])
            const allowedLootItemIds = new Set([
              'bone',
              'mushroom',
              'red_crystal',
              'blue_crystal',
              ...generatedItemDefinitions.map((definition) => definition.id),
            ])
            const defaultSpawnerStats = {
              mushroom: { maxHp: 30, rewardCoins: 10, attackDamage: 10, sizeScale: 1 },
              skeleton: { maxHp: 80, rewardCoins: 30, attackDamage: 25, sizeScale: 1 },
              skeleton_archer: { maxHp: 60, rewardCoins: 35, attackDamage: 18, sizeScale: 1 },
              skeleton_mage: { maxHp: 55, rewardCoins: 45, attackDamage: 30, sizeScale: 1 },
            }
            generatedEnemyDefinitions.forEach((definition) => {
              defaultSpawnerStats[definition.id] = {
                maxHp: definition.maxHp,
                rewardCoins: definition.rewardCoins,
                attackDamage: definition.attackDamage,
                sizeScale: definition.sizeScale,
              }
            })
            const defaultLootTables = {
              skeleton: [
                { itemId: 'bone', chance: 0.5 },
                { itemId: 'blue_crystal', chance: 0.06 },
              ],
              skeleton_archer: [
                { itemId: 'bone', chance: 0.5 },
                { itemId: 'blue_crystal', chance: 0.06 },
              ],
              skeleton_mage: [
                { itemId: 'bone', chance: 0.5 },
                { itemId: 'blue_crystal', chance: 0.06 },
              ],
              mushroom: [
                { itemId: 'mushroom', chance: 0.5 },
                { itemId: 'red_crystal', chance: 0.06 },
              ],
            }
            generatedEnemyDefinitions.forEach((definition) => {
              defaultLootTables[definition.id] = Array.isArray(definition.defaultLootTable) ? definition.defaultLootTable : []
            })
            const sanitizedSpawners = spawners.map((spawner, index) => {
              const monsterType = allowedMonsterTypes.has(spawner.monsterType)
                ? spawner.monsterType
                : null
              const position = Array.isArray(spawner.position) ? spawner.position : [0, 0, 0]
              const id = typeof spawner.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(spawner.id)
                ? spawner.id
                : `monster_spawner_${index + 1}`

              if (!monsterType) throw new Error(`Unknown monster spawner type at index ${index}`)
              const rawVariants = Array.isArray(spawner.variants) && spawner.variants.length
                ? spawner.variants
                : [{ monsterType, weight: 100 }]
              const variants = rawVariants
                .map((variant) => ({
                  monsterType: allowedMonsterTypes.has(variant.monsterType) ? variant.monsterType : null,
                  weight: Number.isFinite(Number(variant.weight))
                    ? Math.min(100, Math.max(0, Number(variant.weight)))
                    : 0,
                }))
                .filter((variant) => variant.monsterType && variant.weight > 0)
              const stats = defaultSpawnerStats[monsterType] ?? defaultSpawnerStats.mushroom
              const rawLootTable = Array.isArray(spawner.lootTable) && spawner.lootTable.length
                ? spawner.lootTable
                : defaultLootTables[monsterType] ?? defaultLootTables.mushroom
              const lootByItem = new Map()
              rawLootTable.forEach((entry) => {
                if (!allowedLootItemIds.has(entry?.itemId)) return
                const chance = Number(entry.chance)
                if (!Number.isFinite(chance) || chance <= 0) return
                lootByItem.set(entry.itemId, Math.max(lootByItem.get(entry.itemId) ?? 0, Math.min(1, chance)))
              })
              const lootTable = Array.from(lootByItem.entries()).map(([itemId, chance]) => ({
                itemId,
                chance: Math.round(chance * 1000) / 1000,
              }))

              return {
                id,
                monsterType,
                heightOffset: Number.isFinite(Number(spawner.heightOffset))
                  ? Math.min(30, Math.max(-10, Number(spawner.heightOffset)))
                  : 0,
                position: [
                  Number.isFinite(Number(position[0])) ? Number(position[0]) : 0,
                  Number.isFinite(Number(position[1])) ? Number(position[1]) : 0,
                  Number.isFinite(Number(position[2])) ? Number(position[2]) : 0,
                ],
                radius: Number.isFinite(Number(spawner.radius))
                  ? Math.min(80, Math.max(1, Number(spawner.radius)))
                  : Number.isFinite(Number(spawner.diameter))
                    ? Math.min(80, Math.max(1, Number(spawner.diameter) * 0.5))
                    : 12,
                populationMax: Number.isFinite(Number(spawner.populationMax))
                  ? Math.min(50, Math.max(1, Math.round(Number(spawner.populationMax))))
                  : 6,
                respawnSeconds: Number.isFinite(Number(spawner.respawnSeconds))
                  ? Math.min(600, Math.max(1, Math.round(Number(spawner.respawnSeconds))))
                  : 30,
                minDistance: Number.isFinite(Number(spawner.minDistance))
                  ? Math.min(40, Math.max(0, Number(spawner.minDistance)))
                  : 5,
                maxHp: Number.isFinite(Number(spawner.maxHp))
                  ? Math.min(10000, Math.max(1, Math.round(Number(spawner.maxHp))))
                  : stats.maxHp,
                rewardCoins: Number.isFinite(Number(spawner.rewardCoins))
                  ? Math.min(100000, Math.max(0, Math.round(Number(spawner.rewardCoins))))
                  : stats.rewardCoins,
                attackDamage: Number.isFinite(Number(spawner.attackDamage))
                  ? Math.min(10000, Math.max(0, Math.round(Number(spawner.attackDamage))))
                  : stats.attackDamage,
                sizeScale: Number.isFinite(Number(spawner.sizeScale))
                  ? Math.min(4, Math.max(0.25, Number(spawner.sizeScale)))
                  : stats.sizeScale,
                lootTable: lootTable.length ? lootTable : defaultLootTables[monsterType] ?? defaultLootTables.mushroom,
                patrol: spawner.patrol === false ? false : true,
                aggressive: spawner.aggressive === false ? false : true,
                variants: variants.length ? variants : [{ monsterType, weight: 100 }],
              }
            })
            const sanitizedBiomes = biomes.map((area, index) => {
              const biome = area.biome === 'graveyard' ? 'graveyard' : null
              const center = Array.isArray(area.center) ? area.center : [0, 0]
              const id = typeof area.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(area.id)
                ? area.id
                : `${biome ?? 'biome'}_${index + 1}`

              if (!biome) throw new Error(`Unknown biome at index ${index}`)

              return {
                id,
                biome,
                center: [
                  Number.isFinite(Number(center[0])) ? Number(center[0]) : 0,
                  Number.isFinite(Number(center[1])) ? Number(center[1]) : 0,
                ],
                radius: Number.isFinite(Number(area.radius))
                  ? Math.min(140, Math.max(2, Number(area.radius)))
                  : 24,
                feather: Number.isFinite(Number(area.feather))
                  ? Math.min(80, Math.max(0.5, Number(area.feather)))
                  : 8,
                groundIntensity: Number.isFinite(Number(area.groundIntensity))
                  ? Math.min(1, Math.max(0, Number(area.groundIntensity)))
                  : 1,
                fogIntensity: Number.isFinite(Number(area.fogIntensity))
                  ? Math.min(1, Math.max(0, Number(area.fogIntensity)))
                  : 0.5,
                particleIntensity: Number.isFinite(Number(area.particleIntensity))
                  ? Math.min(1, Math.max(0, Number(area.particleIntensity)))
                  : 0.65,
                groundColors: {
                  darkSoil: typeof area.groundColors?.darkSoil === 'string' && /^#[0-9a-fA-F]{6}$/.test(area.groundColors.darkSoil)
                    ? area.groundColors.darkSoil
                    : '#2e261f',
                  dryClay: typeof area.groundColors?.dryClay === 'string' && /^#[0-9a-fA-F]{6}$/.test(area.groundColors.dryClay)
                    ? area.groundColors.dryClay
                    : '#595046',
                  ash: typeof area.groundColors?.ash === 'string' && /^#[0-9a-fA-F]{6}$/.test(area.groundColors.ash)
                    ? area.groundColors.ash
                    : '#7a7d73',
                  boneDust: typeof area.groundColors?.boneDust === 'string' && /^#[0-9a-fA-F]{6}$/.test(area.groundColors.boneDust)
                    ? area.groundColors.boneDust
                    : '#9e9780',
                  coldShadow: typeof area.groundColors?.coldShadow === 'string' && /^#[0-9a-fA-F]{6}$/.test(area.groundColors.coldShadow)
                    ? area.groundColors.coldShadow
                    : '#293331',
                },
                source: area.source === 'paint' ? 'paint' : 'authored',
                ambient: area.ambient === false ? false : true,
              }
            })
            const source = [
              'export const MAP_OBJECTS_ARE_AUTHORING_STATE = true',
              '',
              `export const MAP_OBJECT_PLACEMENTS = ${JSON.stringify(sanitizedPlacements, null, 2)}`,
              `export const MAP_MONSTER_SPAWNERS = ${JSON.stringify(sanitizedSpawners, null, 2)}`,
              '',
            ].join('\n\n')
            await writeFile(join(process.cwd(), 'src', 'world', 'mapObjects.generated.js'), source)
            const biomeSource = [
              `export const MAP_BIOME_AREAS = ${JSON.stringify(sanitizedBiomes, null, 2)}`,
              '',
            ].join('\n')
            await writeFile(join(process.cwd(), 'src', 'world', 'biomeAreas.generated.js'), biomeSource)
            await generateTerrainSurfaceMask({ biomeAreas: sanitizedBiomes })

            const terrainSource = [
              `export const MAP_TERRAIN_MODIFICATIONS = ${JSON.stringify(sanitizedTerrainModifications, null, 2)}`,
              '',
            ].join('\n')
            await writeFile(join(process.cwd(), 'src', 'world', 'terrain', 'terrainModifications.generated.js'), terrainSource)

            // Régénère aussi le binaire lu par le jeu (cf. terrainGeometry.js / terrainReady).
            // Sans ça, l'éditeur écrit le .generated.js mais le runtime continue de lire
            // l'ancien .bin → les éditions de terrain n'apparaissent pas. Même format que
            // scripts/encode-terrain-bin.mjs : header uint32 N | xs(Int32) | zs(Int32) | vals(Float32).
            const terrainKeys = Object.keys(sanitizedTerrainModifications)
            const terrainCount = terrainKeys.length
            const terrainXs = new Int32Array(terrainCount)
            const terrainZs = new Int32Array(terrainCount)
            const terrainVals = new Float32Array(terrainCount)
            terrainKeys.forEach((key, i) => {
              const sepIndex = key.indexOf('_')
              terrainXs[i] = Number(key.slice(0, sepIndex))
              terrainZs[i] = Number(key.slice(sepIndex + 1))
              terrainVals[i] = sanitizedTerrainModifications[key]
            })
            const terrainHeader = Uint32Array.from([terrainCount])
            const terrainBin = Buffer.concat([
              Buffer.from(terrainHeader.buffer),
              Buffer.from(terrainXs.buffer),
              Buffer.from(terrainZs.buffer),
              Buffer.from(terrainVals.buffer),
            ])
            await mkdir(join(process.cwd(), 'public', 'terrain'), { recursive: true })
            await writeFile(join(process.cwd(), 'public', 'terrain', 'modifications.bin'), terrainBin)

            const pathsSource = [
              `export const MAP_PATHS = ${JSON.stringify(sanitizedPaths, null, 2)}`,
              '',
            ].join('\n')
            await writeFile(join(process.cwd(), 'src', 'world', 'paths.generated.js'), pathsSource)

            res.statusCode = 200
            res.end('ok')
          } catch (err) {
            res.statusCode = 500
            res.end(err.message)
          }
        })
      })
    },
  }
}

function ezTreeSourcePlugin() {
  const lazyTexturesModule = join(process.cwd(), 'src', 'vendor', 'ezTreeTextures.js')

  return {
    name: 'ez-tree-source',
    enforce: 'pre',
    resolveId(source, importer) {
      const normalizedImporter = importer?.split('\\').join('/') ?? ''
      if (
        source === './textures'
        && normalizedImporter.endsWith('/@dgreenheck/ez-tree/src/lib/tree.js')
      ) {
        return lazyTexturesModule
      }
      return null
    },
  }
}

export default defineConfig({
  cacheDir: '../.npm-cache/vite-web',
  plugins: [ezTreeSourcePlugin(), react(), saveThumbnailPlugin()],
  resolve: {
    alias: {
      // The published EZ Tree bundle inlines all of its textures as base64 and
      // bundles its own Three.js copy. Its source entry exposes the exact same
      // API while allowing Vite to share Three.js and emit textures as assets.
      '@dgreenheck/ez-tree': join(
        process.cwd(),
        'node_modules',
        '@dgreenheck',
        'ez-tree',
        'src',
        'lib',
        'index.js',
      ),
    },
  },
  server: {
    proxy: {
      '/youtube-channel': {
        target: 'http://127.0.0.1:2567',
        changeOrigin: true,
      },
      '/tiktok-profile': {
        target: 'http://127.0.0.1:2567',
        changeOrigin: true,
      },
    },
  },
  // Version figée au moment du build : sert à invalider le cache du .bin de terrain
  // à chaque déploiement en prod (cf. terrainGeometry.js). En dev, terrainGeometry
  // utilise plutôt Date.now() à chaque chargement pour toujours lire le .bin frais.
  define: {
    __TERRAIN_BIN_BUILD__: JSON.stringify(String(Date.now())),
  },
  build: {
    rollupOptions: {
      output: {
        // Découpe les dépendances lourdes en chunks séparés du code applicatif.
        // Bénéfice : entre deux déploiements, three/rapier/react ne changent pas →
        // le navigateur garde ces chunks en cache et ne re-télécharge que le code
        // applicatif modifié. Aussi : téléchargement/parse en parallèle au 1er chargement.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          // @anthropic-ai : lourd ET utilisé uniquement par l'Éditeur (chargé en lazy).
          // On le laisse au bundler -> il reste dans le chunk lazy de l'Éditeur.
          if (/[\\/]@anthropic-ai[\\/]/.test(id)) return undefined
          if (/[\\/](three|@react-three|@dimforge|rapier)/.test(id)) return 'vendor-three'
          if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react'
          if (/[\\/](colyseus|@supabase)/.test(id)) return 'vendor-net'
          // Reste de l'écosystème (drei, troika, ez-tree…) : chunk stable, mis en cache
          // par le navigateur entre déploiements -> une MAJ de gameplay ne re-télécharge
          // que le petit chunk applicatif.
          return 'vendor'
        },
      },
    },
  },
})
