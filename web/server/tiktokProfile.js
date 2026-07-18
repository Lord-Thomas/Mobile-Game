import { Buffer } from 'node:buffer'

const DEFAULT_PROFILE = 'https://www.tiktok.com/@thoms.gail'
const CACHE_TTL_MS = 15 * 60 * 1000
const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'])

function invalidProfileReference() {
  const error = new Error('Lien de profil TikTok invalide. Utilise un lien tiktok.com/@pseudo.')
  error.code = 'INVALID_TIKTOK_PROFILE_REFERENCE'
  return error
}

export function parseTikTokProfileReference(reference = DEFAULT_PROFILE) {
  const input = String(reference || DEFAULT_PROFILE).trim()
  let handle
  if (input.startsWith('@')) {
    handle = input.slice(1)
  } else {
    let url
    try {
      url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`)
    } catch {
      throw invalidProfileReference()
    }
    if (!TIKTOK_HOSTS.has(url.hostname.toLowerCase())) throw invalidProfileReference()
    const profilePart = url.pathname.split('/').filter(Boolean)[0]
    handle = profilePart?.startsWith('@') ? decodeURIComponent(profilePart.slice(1)) : ''
  }
  if (!/^[a-zA-Z0-9._]{2,32}$/.test(handle)) throw invalidProfileReference()
  return {
    handle,
    profileUrl: `https://www.tiktok.com/@${handle}`,
    cacheKey: handle.toLowerCase(),
  }
}

function extractJsonScript(html, id) {
  const pattern = new RegExp(`<script[^>]+id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i')
  const source = html.match(pattern)?.[1]
  if (!source) return null
  try {
    return JSON.parse(source.replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
  } catch {
    return null
  }
}

export function extractTikTokProfileData(html, requestedHandle) {
  const universal = extractJsonScript(html, '__UNIVERSAL_DATA_FOR_REHYDRATION__')
  const detail = universal?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo
  const sigi = extractJsonScript(html, 'SIGI_STATE')
  const sigiUsers = sigi?.UserModule?.users ?? {}
  const sigiStats = sigi?.UserModule?.stats ?? {}
  const sigiKey = Object.keys(sigiUsers).find((key) => key.toLowerCase() === requestedHandle.toLowerCase())
    ?? Object.keys(sigiUsers)[0]
  const user = detail?.user ?? sigiUsers[sigiKey]
  const stats = detail?.stats ?? sigiStats[sigiKey]
  if (!user) throw new Error(`TikTok profile @${requestedHandle} was not found`)
  const followerCount = Number(stats?.followerCount)
  return {
    displayName: user.nickname || user.uniqueId || requestedHandle,
    handle: `@${user.uniqueId || requestedHandle}`,
    followerCount: Number.isFinite(followerCount) ? followerCount : null,
    avatarUrl: user.avatarLarger || user.avatarMedium || user.avatarThumb || null,
  }
}

async function avatarToDataUrl(url, fetchImpl) {
  if (!url) return null
  try {
    const response = await fetchImpl(url, { headers: { Referer: 'https://www.tiktok.com/' } })
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

export async function fetchTikTokProfile({ profile = DEFAULT_PROFILE, fetchImpl = fetch }) {
  const reference = parseTikTokProfileReference(profile)
  const response = await fetchImpl(reference.profileUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    },
  })
  if (!response.ok) throw new Error(`TikTok profile request failed (${response.status})`)
  const data = extractTikTokProfileData(await response.text(), reference.handle)
  return {
    ...data,
    avatarDataUrl: await avatarToDataUrl(data.avatarUrl, fetchImpl),
    profileUrl: reference.profileUrl,
    updatedAt: new Date().toISOString(),
  }
}

export function createTikTokProfileHandler({ fetchImpl = fetch } = {}) {
  const cache = new Map()
  return async function handleTikTokProfile(req, res) {
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('cache-control', 'public, max-age=300, stale-while-revalidate=900')
    res.setHeader('content-type', 'application/json; charset=utf-8')
    let reference
    try {
      const requestUrl = new URL(req?.url || '/tiktok-profile', 'http://localhost')
      reference = parseTikTokProfileReference(requestUrl.searchParams.get('profile') || DEFAULT_PROFILE)
      const cached = cache.get(reference.cacheKey)
      if (cached?.value && Date.now() < cached.expiresAt) {
        res.writeHead(200)
        res.end(JSON.stringify(cached.value))
        return
      }
      const value = await fetchTikTokProfile({ profile: reference.profileUrl, fetchImpl })
      cache.set(reference.cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS })
      res.writeHead(200)
      res.end(JSON.stringify(value))
    } catch (error) {
      const stale = reference ? cache.get(reference.cacheKey)?.value : null
      if (stale) {
        res.writeHead(200)
        res.end(JSON.stringify({ ...stale, stale: true }))
        return
      }
      res.writeHead(error?.code === 'INVALID_TIKTOK_PROFILE_REFERENCE' ? 400 : 503)
      res.end(JSON.stringify({ error: error.message }))
    }
  }
}
