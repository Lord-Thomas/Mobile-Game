export const YOUTUBE_CHANNEL_FALLBACK = {
  title: 'Thoms_gail',
  handle: '@Thoms_gail',
  subscriberCount: null,
  thumbnailDataUrl: null,
  channelUrl: 'https://www.youtube.com/@Thoms_gail',
  updatedAt: null,
}

function getStatsUrl() {
  if (import.meta.env.DEV) return '/youtube-channel'
  return '/api/youtube-channel'
}

export function normalizeYouTubeChannelUrl(value) {
  const input = String(value ?? '').trim()
  if (input.startsWith('@') && input.length >= 4 && !/[\s/?#]/.test(input)) {
    return `https://www.youtube.com/${input}`
  }
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(input)) {
    return `https://www.youtube.com/channel/${input}`
  }
  let url
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`)
  } catch {
    throw new Error('Colle un lien de chaîne YouTube valide.')
  }
  if (!['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname.toLowerCase())) {
    throw new Error('Le lien doit provenir de youtube.com.')
  }
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0]?.startsWith('@') && !/[\s/?#]/.test(parts[0])) {
    return `https://www.youtube.com/${parts[0]}`
  }
  if (parts[0] === 'channel' && /^UC[a-zA-Z0-9_-]{22}$/.test(parts[1] ?? '')) {
    return `https://www.youtube.com/channel/${parts[1]}`
  }
  if (parts[0] === 'user' && parts[1] && !/[\s/?#]/.test(parts[1])) {
    return `https://www.youtube.com/user/${parts[1]}`
  }
  throw new Error('Utilise un lien YouTube /@handle, /channel/UC... ou /user/...')
}

export async function loadYouTubeChannel(channelUrl, signal) {
  const url = new URL(getStatsUrl(), window.location.origin)
  if (channelUrl) url.searchParams.set('channel', channelUrl)
  const response = await fetch(url.toString(), { signal })
  if (!response.ok) throw new Error(`YouTube channel request failed (${response.status})`)
  const channel = await response.json()
  return { ...YOUTUBE_CHANNEL_FALLBACK, ...channel }
}
