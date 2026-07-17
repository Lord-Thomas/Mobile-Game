import http from 'node:http'
import { loadEnvFile } from 'node:process'
import { Server } from 'colyseus'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { VisitRoom } from './rooms/VisitRoom.js'
import { createYouTubeChannelHandler } from './youtubeChannel.js'

try {
  loadEnvFile()
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

const port = Number(process.env.PORT ?? process.env.COLYSEUS_PORT ?? 2567)
const host = process.env.COLYSEUS_HOST ?? '0.0.0.0'
const handleYouTubeChannel = createYouTubeChannelHandler({
  apiKey: process.env.YOUTUBE_API_KEY,
  handle: process.env.YOUTUBE_CHANNEL_HANDLE,
})

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }
  if (req.url === '/youtube-channel' && req.method === 'GET') {
    handleYouTubeChannel(req, res)
    return
  }

  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end('Colyseus visit server is running.')
})

const gameServer = new Server({
  transport: new WebSocketTransport({ server }),
})

gameServer.define('visit_room', VisitRoom).filterBy(['sessionId'])
gameServer.listen(port, host)

console.log(`[colyseus] visit server listening on ws://${host}:${port}`)
