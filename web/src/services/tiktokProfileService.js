import { getColyseusUrl } from './colyseusSessionService'

const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'])

export const TIKTOK_PROFILE_FALLBACK = {
  displayName: 'Thoms Gail',
  handle: '@thoms.gail',
  followerCount: null,
  avatarDataUrl: null,
  profileUrl: 'https://www.tiktok.com/@thoms.gail',
  updatedAt: null,
}

function normalizeHandle(value) {
  const handle = String(value ?? '').trim().replace(/^@/, '')
  if (!/^[a-zA-Z0-9._]{2,32}$/.test(handle)) {
    throw new Error('Le pseudo TikTok doit contenir uniquement des lettres, chiffres, points ou underscores.')
  }
  return handle
}

export function getTikTokHandle(value) {
  const input = String(value ?? '').trim()
  if (input.startsWith('@')) return normalizeHandle(input)

  let url
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`)
  } catch {
    throw new Error('Colle un lien de profil TikTok valide.')
  }
  if (!TIKTOK_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('Le lien doit provenir de tiktok.com.')
  }
  const profilePart = url.pathname.split('/').filter(Boolean)[0]
  if (!profilePart?.startsWith('@')) {
    throw new Error('Utilise un lien de profil TikTok au format tiktok.com/@pseudo.')
  }
  return normalizeHandle(profilePart)
}

export function normalizeTikTokProfileUrl(value) {
  return `https://www.tiktok.com/@${getTikTokHandle(value)}`
}

function getProfileEndpoint() {
  const configuredUrl = import.meta.env.VITE_TIKTOK_PROFILE_URL
  if (configuredUrl) return configuredUrl
  if (import.meta.env.DEV) return '/tiktok-profile'

  try {
    const url = new URL(getColyseusUrl())
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
    url.pathname = '/tiktok-profile'
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return '/tiktok-profile'
  }
}

export async function loadTikTokProfile(profileUrl, signal) {
  const url = new URL(getProfileEndpoint(), window.location.origin)
  if (profileUrl) url.searchParams.set('profile', profileUrl)
  const response = await fetch(url.toString(), { signal })
  if (!response.ok) throw new Error(`TikTok profile request failed (${response.status})`)
  return { ...TIKTOK_PROFILE_FALLBACK, ...await response.json() }
}
