import { Buffer } from 'node:buffer'

const DEFAULT_HANDLE = '@Thoms_gail'
const DEFAULT_CHANNEL_URL = 'https://www.youtube.com/@Thoms_gail'
const CACHE_TTL_MS = 15 * 60 * 1000

async function thumbnailToDataUrl(url, fetchImpl) {
  if (!url) return null
  try {
    const response = await fetchImpl(url)
    if (!response.ok) return null
    const contentType = response.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) return null
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > 1_000_000) return null
    return `data:${contentType};base64,${bytes.toString('base64')}`
  } catch {
    return null
  }
}

export async function fetchYouTubeChannel({ apiKey, handle = DEFAULT_HANDLE, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is not configured')

  const url = new URL('https://www.googleapis.com/youtube/v3/channels')
  url.searchParams.set('part', 'snippet,statistics')
  url.searchParams.set('forHandle', handle)
  url.searchParams.set('key', apiKey)
  const response = await fetchImpl(url)
  if (!response.ok) throw new Error(`YouTube API request failed (${response.status})`)
  const payload = await response.json()
  const item = payload.items?.[0]
  if (!item) throw new Error(`YouTube channel ${handle} was not found`)

  const thumbnailUrl = item.snippet?.thumbnails?.high?.url
    ?? item.snippet?.thumbnails?.medium?.url
    ?? item.snippet?.thumbnails?.default?.url
    ?? null
  const subscriberCount = item.statistics?.hiddenSubscriberCount
    ? null
    : Number(item.statistics?.subscriberCount)

  return {
    title: item.snippet?.title || 'Thoms_gail',
    handle,
    subscriberCount: Number.isFinite(subscriberCount) ? subscriberCount : null,
    thumbnailDataUrl: await thumbnailToDataUrl(thumbnailUrl, fetchImpl),
    channelUrl: DEFAULT_CHANNEL_URL,
    updatedAt: new Date().toISOString(),
  }
}

export function createYouTubeChannelHandler({
  apiKey,
  handle = DEFAULT_HANDLE,
  fetchImpl = fetch,
} = {}) {
  let cached = null
  let expiresAt = 0
  let pending = null

  return async function handleYouTubeChannel(_req, res) {
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('cache-control', 'public, max-age=300, stale-while-revalidate=900')
    res.setHeader('content-type', 'application/json; charset=utf-8')
    try {
      if (cached && Date.now() < expiresAt) {
        res.writeHead(200)
        res.end(JSON.stringify(cached))
        return
      }
      pending ??= fetchYouTubeChannel({ apiKey, handle, fetchImpl })
        .then((channel) => {
          cached = channel
          expiresAt = Date.now() + CACHE_TTL_MS
          return channel
        })
        .finally(() => { pending = null })
      const channel = await pending
      res.writeHead(200)
      res.end(JSON.stringify(channel))
    } catch (error) {
      if (cached) {
        res.writeHead(200)
        res.end(JSON.stringify({ ...cached, stale: true }))
        return
      }
      res.writeHead(503)
      res.end(JSON.stringify({ error: error.message }))
    }
  }
}
