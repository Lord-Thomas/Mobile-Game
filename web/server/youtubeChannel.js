import { Buffer } from 'node:buffer'

const DEFAULT_HANDLE = '@Thoms_gail'
const CACHE_TTL_MS = 15 * 60 * 1000
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com'])

function invalidChannelReference() {
  const error = new Error('Lien de chaîne YouTube invalide. Utilise un lien /@handle, /channel/UC... ou /user/...')
  error.code = 'INVALID_YOUTUBE_CHANNEL_REFERENCE'
  return error
}

export function parseYouTubeChannelReference(reference = DEFAULT_HANDLE) {
  const input = String(reference || DEFAULT_HANDLE).trim()
  if (!input) throw invalidChannelReference()

  if (input.startsWith('@')) {
    if (input.length < 4 || input.length > 101 || /[\s/?#]/.test(input)) throw invalidChannelReference()
    return {
      filter: 'forHandle',
      value: input,
      handle: input,
      channelUrl: `https://www.youtube.com/${input}`,
      cacheKey: `handle:${input.toLowerCase()}`,
    }
  }

  if (/^UC[a-zA-Z0-9_-]{22}$/.test(input)) {
    return {
      filter: 'id',
      value: input,
      handle: null,
      channelUrl: `https://www.youtube.com/channel/${input}`,
      cacheKey: `id:${input}`,
    }
  }

  let url
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`)
  } catch {
    throw invalidChannelReference()
  }
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) throw invalidChannelReference()

  const parts = url.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part))
  if (parts[0]?.startsWith('@')) return parseYouTubeChannelReference(parts[0])
  if (parts[0] === 'channel' && parts[1]) return parseYouTubeChannelReference(parts[1])
  if (parts[0] === 'user' && parts[1] && !/[\s/?#]/.test(parts[1])) {
    return {
      filter: 'forUsername',
      value: parts[1],
      handle: null,
      channelUrl: `https://www.youtube.com/user/${encodeURIComponent(parts[1])}`,
      cacheKey: `username:${parts[1].toLowerCase()}`,
    }
  }
  throw invalidChannelReference()
}

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

export async function fetchYouTubeChannel({ apiKey, channel, handle = DEFAULT_HANDLE, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is not configured')
  const reference = parseYouTubeChannelReference(channel ?? handle)

  const url = new URL('https://www.googleapis.com/youtube/v3/channels')
  url.searchParams.set('part', 'snippet,statistics')
  url.searchParams.set(reference.filter, reference.value)
  url.searchParams.set('key', apiKey)
  const response = await fetchImpl(url)
  if (!response.ok) throw new Error(`YouTube API request failed (${response.status})`)
  const payload = await response.json()
  const item = payload.items?.[0]
  if (!item) throw new Error(`YouTube channel ${reference.value} was not found`)

  const thumbnailUrl = item.snippet?.thumbnails?.high?.url
    ?? item.snippet?.thumbnails?.medium?.url
    ?? item.snippet?.thumbnails?.default?.url
    ?? null
  const subscriberCount = item.statistics?.hiddenSubscriberCount
    ? null
    : Number(item.statistics?.subscriberCount)

  return {
    title: item.snippet?.title || 'Thoms_gail',
    handle: item.snippet?.customUrl || reference.handle,
    subscriberCount: Number.isFinite(subscriberCount) ? subscriberCount : null,
    thumbnailDataUrl: await thumbnailToDataUrl(thumbnailUrl, fetchImpl),
    channelUrl: item.id ? `https://www.youtube.com/channel/${item.id}` : reference.channelUrl,
    updatedAt: new Date().toISOString(),
  }
}

export function createYouTubeChannelHandler({
  apiKey,
  handle = DEFAULT_HANDLE,
  fetchImpl = fetch,
} = {}) {
  const cache = new Map()

  return async function handleYouTubeChannel(req, res) {
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('cache-control', 'public, max-age=300, stale-while-revalidate=900')
    res.setHeader('content-type', 'application/json; charset=utf-8')
    let reference
    try {
      const requestUrl = new URL(req?.url || '/youtube-channel', 'http://localhost')
      reference = parseYouTubeChannelReference(requestUrl.searchParams.get('channel') || handle)
      const cached = cache.get(reference.cacheKey)
      if (cached?.value && Date.now() < cached.expiresAt) {
        res.writeHead(200)
        res.end(JSON.stringify(cached.value))
        return
      }
      const pending = cached?.pending ?? fetchYouTubeChannel({ apiKey, channel: reference.channelUrl, fetchImpl })
        .then((channel) => {
          cache.set(reference.cacheKey, {
            value: channel,
            expiresAt: Date.now() + CACHE_TTL_MS,
            pending: null,
          })
          return channel
        })
        .catch((error) => {
          cache.set(reference.cacheKey, { ...cached, pending: null })
          throw error
        })
      cache.set(reference.cacheKey, { ...cached, pending })
      const channel = await pending
      res.writeHead(200)
      res.end(JSON.stringify(channel))
    } catch (error) {
      const cached = reference ? cache.get(reference.cacheKey)?.value : null
      if (cached) {
        res.writeHead(200)
        res.end(JSON.stringify({ ...cached, stale: true }))
        return
      }
      res.writeHead(error?.code === 'INVALID_YOUTUBE_CHANNEL_REFERENCE' ? 400 : 503)
      res.end(JSON.stringify({ error: error.message }))
    }
  }
}
