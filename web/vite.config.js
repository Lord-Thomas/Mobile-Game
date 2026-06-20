import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { Buffer } from 'node:buffer'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

function saveThumbnailPlugin() {
  return {
    name: 'dev-save-assets',
    configureServer(server) {
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
            const sanitizedPlacements = placements.map((placement, index) => {
              const objectId = placement.objectId === 'skeleton_tower' ? 'skeleton_tower' : null
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
            const source = `export const MAP_OBJECT_PLACEMENTS = ${JSON.stringify(sanitizedPlacements, null, 2)}\n`
            await writeFile(join(process.cwd(), 'src', 'world', 'mapObjects.generated.js'), source)
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
