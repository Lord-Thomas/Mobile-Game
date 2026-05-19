import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

function saveThumbnailPlugin() {
  return {
    name: 'save-thumbnail',
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
    },
  }
}

export default defineConfig({
  plugins: [react(), saveThumbnailPlugin()],
})
