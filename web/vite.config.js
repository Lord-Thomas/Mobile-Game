import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { Buffer } from 'node:buffer'
import { writeFile, mkdir, readdir } from 'node:fs/promises'
import { basename, extname, join, relative, sep } from 'node:path'

const MAP_MODEL_EXTENSIONS = new Set(['.glb', '.gltf', '.fbx'])
const RESERVED_MAP_OBJECT_IDS = new Set(['skeleton_tower', 'magic_skull_necromancer'])

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

function saveThumbnailPlugin() {
  return {
    name: 'dev-save-assets',
    configureServer(server) {
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

              return {
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
            })
            const allowedMonsterTypes = new Set(['skeleton', 'mushroom', 'skeleton_archer', 'skeleton_mage'])
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

            const terrainSource = [
              `export const MAP_TERRAIN_MODIFICATIONS = ${JSON.stringify(sanitizedTerrainModifications, null, 2)}`,
              '',
            ].join('\n')
            await writeFile(join(process.cwd(), 'src', 'world', 'terrain', 'terrainModifications.generated.js'), terrainSource)

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

export default defineConfig({
  cacheDir: '../.npm-cache/vite-web',
  plugins: [react(), saveThumbnailPlugin()],
})
