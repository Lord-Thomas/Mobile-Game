import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { objectCatalog } from '../src/gameObjects/placeableObjects.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const publicRoot = join(projectRoot, 'public')
const nodeModulesVite = join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const baseUrl = process.env.THUMBNAIL_BASE_URL || 'http://127.0.0.1:5173'
const baseUrlData = new URL(baseUrl)
const viteHost = baseUrlData.hostname || '127.0.0.1'
const vitePort = baseUrlData.port || '5173'
const force = process.argv.includes('--force')
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='))
const onlyObjectId = onlyArg ? onlyArg.slice('--only='.length) : null

function thumbnailPath(thumbnail) {
  if (!thumbnail?.startsWith('/')) return null
  return join(publicRoot, thumbnail.slice(1))
}

function browserExecutable() {
  if (process.env.THUMBNAIL_BROWSER) return process.env.THUMBNAIL_BROWSER

  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]

  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

async function isServerReady() {
  try {
    const response = await fetch(baseUrl, { method: 'HEAD' })
    return response.ok
  } catch {
    return false
  }
}

async function waitForServer(timeoutMs = 15000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isServerReady()) return true
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  return false
}

function startViteServer() {
  return spawn(process.execPath, [nodeModulesVite, '--host', viteHost, '--port', vitePort, '--strictPort'], {
    cwd: projectRoot,
    stdio: 'ignore',
    windowsHide: true,
  })
}

function runBrowserCapture(browser, objectId, outputPath) {
  const profilePath = join(projectRoot, `.thumbnail-profile-${objectId}`)
  const url = `${baseUrl}/?tool=thumbnail&capture=${encodeURIComponent(objectId)}&v=auto`

  return new Promise((resolveCapture, rejectCapture) => {
    const child = spawn(browser, [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-crash-reporter',
      '--disable-breakpad',
      '--disable-extensions',
      '--hide-scrollbars',
      `--user-data-dir=${profilePath}`,
      '--window-size=256,256',
      '--virtual-time-budget=12000',
      `--screenshot=${outputPath}`,
      url,
    ], {
      cwd: projectRoot,
      stdio: 'ignore',
      windowsHide: true,
    })

    child.on('error', rejectCapture)
    child.on('exit', async (code) => {
      await rm(profilePath, { recursive: true, force: true })
      if (code === 0 && existsSync(outputPath)) {
        resolveCapture()
        return
      }
      rejectCapture(new Error(`Capture failed for ${objectId} with code ${code}`))
    })
  })
}

const entries = Object.values(objectCatalog)
  .filter((item) => !onlyObjectId || item.id === onlyObjectId)
  .map((item) => ({ item, outputPath: thumbnailPath(item.thumbnail) }))
  .filter(({ outputPath }) => outputPath)
  .filter(({ outputPath }) => force || !existsSync(outputPath))

if (!entries.length) {
  console.log(onlyObjectId ? `Object thumbnail is up to date or unknown: ${onlyObjectId}` : 'Object thumbnails are up to date.')
  process.exit(0)
}

const browser = browserExecutable()
if (!browser) {
  console.warn('No supported browser found. Skipping object thumbnail generation.')
  process.exit(0)
}

let server = null

try {
  if (!(await isServerReady())) {
    server = startViteServer()
    const ready = await waitForServer()
    if (!ready) throw new Error('Vite server did not start for thumbnail generation.')
  }

  for (const { item, outputPath } of entries) {
    await mkdir(dirname(outputPath), { recursive: true })
    await runBrowserCapture(browser, item.id, outputPath)
    console.log(`Generated ${item.thumbnail}`)
  }
} finally {
  if (server) server.kill()
}
