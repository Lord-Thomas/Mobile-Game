import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { Buffer } from 'node:buffer'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

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
            const sanitizedPlacements = placements.map((placement, index) => {
              const objectId = placement.objectId === 'skeleton_tower' || /^tree_[a-zA-Z0-9_-]+$/.test(placement.objectId)
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
            const sanitizedSpawners = spawners.map((spawner, index) => {
              const monsterType = spawner.monsterType === 'skeleton' || spawner.monsterType === 'mushroom'
                ? spawner.monsterType
                : null
              const position = Array.isArray(spawner.position) ? spawner.position : [0, 0, 0]
              const id = typeof spawner.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(spawner.id)
                ? spawner.id
                : `monster_spawner_${index + 1}`

              if (!monsterType) throw new Error(`Unknown monster spawner type at index ${index}`)

              return {
                id,
                monsterType,
                position: [
                  Number.isFinite(Number(position[0])) ? Number(position[0]) : 0,
                  Number.isFinite(Number(position[1])) ? Number(position[1]) : 0,
                  Number.isFinite(Number(position[2])) ? Number(position[2]) : 0,
                ],
                diameter: Number.isFinite(Number(spawner.diameter))
                  ? Math.min(80, Math.max(2, Number(spawner.diameter)))
                  : 12,
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
