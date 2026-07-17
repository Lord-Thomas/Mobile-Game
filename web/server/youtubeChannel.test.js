import { describe, expect, it, vi } from 'vitest'
import { fetchYouTubeChannel, parseYouTubeChannelReference } from './youtubeChannel'

describe('YouTube channel service', () => {
  it('loads public channel metadata through forHandle', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{
            snippet: { title: 'Thoms', thumbnails: {} },
            statistics: { subscriberCount: '1234', hiddenSubscriberCount: false },
          }],
        }),
      })
    const channel = await fetchYouTubeChannel({ apiKey: 'test-key', handle: '@Thoms_gail', fetchImpl })
    const requestedUrl = fetchImpl.mock.calls[0][0]

    expect(requestedUrl.searchParams.get('forHandle')).toBe('@Thoms_gail')
    expect(channel.subscriberCount).toBe(1234)
    expect(channel.title).toBe('Thoms')
  })

  it('accepts a public handle URL', () => {
    expect(parseYouTubeChannelReference('https://www.youtube.com/@UneChaine/videos')).toMatchObject({
      filter: 'forHandle',
      value: '@UneChaine',
      channelUrl: 'https://www.youtube.com/@UneChaine',
    })
  })

  it('accepts a canonical channel id URL', () => {
    const channelId = 'UC1234567890123456789012'
    expect(parseYouTubeChannelReference(`https://youtube.com/channel/${channelId}`)).toMatchObject({
      filter: 'id',
      value: channelId,
    })
  })

  it('rejects non-YouTube URLs', () => {
    expect(() => parseYouTubeChannelReference('https://example.com/@UneChaine')).toThrow(/YouTube invalide/i)
  })
})
