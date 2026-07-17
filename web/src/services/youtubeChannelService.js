import { getColyseusUrl } from './colyseusSessionService'

export const YOUTUBE_CHANNEL_FALLBACK = {
  title: 'Thoms_gail',
  handle: '@Thoms_gail',
  subscriberCount: null,
  thumbnailDataUrl: null,
  channelUrl: 'https://www.youtube.com/@Thoms_gail',
  updatedAt: null,
}

function getStatsUrl() {
  const configuredUrl = import.meta.env.VITE_YOUTUBE_STATS_URL
  if (configuredUrl) return configuredUrl
  if (import.meta.env.DEV) return '/youtube-channel'

  try {
    const url = new URL(getColyseusUrl())
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
    url.pathname = '/youtube-channel'
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return '/youtube-channel'
  }
}

export async function loadYouTubeChannel(signal) {
  const response = await fetch(getStatsUrl(), { signal })
  if (!response.ok) throw new Error(`YouTube channel request failed (${response.status})`)
  const channel = await response.json()
  return { ...YOUTUBE_CHANNEL_FALLBACK, ...channel }
}
