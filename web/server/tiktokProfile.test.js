import { describe, expect, it, vi } from 'vitest'
import { extractTikTokProfileData, fetchTikTokProfile, parseTikTokProfileReference } from './tiktokProfile'

const profilePayload = {
  __DEFAULT_SCOPE__: {
    'webapp.user-detail': {
      userInfo: {
        user: {
          uniqueId: 'thoms.gail',
          nickname: 'Thoms Gail',
          avatarLarger: 'https://example.com/avatar.jpeg',
        },
        stats: { followerCount: 12345 },
      },
    },
  },
}

describe('TikTok profile service', () => {
  it('normalizes a public profile URL', () => {
    expect(parseTikTokProfileReference('https://www.tiktok.com/@thoms.gail?lang=fr')).toMatchObject({
      handle: 'thoms.gail',
      profileUrl: 'https://www.tiktok.com/@thoms.gail',
    })
  })

  it('extracts the public profile without changing avatar proportions', () => {
    const html = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(profilePayload)}</script>`
    expect(extractTikTokProfileData(html, 'thoms.gail')).toMatchObject({
      displayName: 'Thoms Gail',
      handle: '@thoms.gail',
      followerCount: 12345,
    })
  })

  it('loads profile data and embeds the avatar as a data URL', async () => {
    const html = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(profilePayload)}</script>`
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => html })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
      })

    const profile = await fetchTikTokProfile({ profile: '@thoms.gail', fetchImpl })
    expect(profile.profileUrl).toBe('https://www.tiktok.com/@thoms.gail')
    expect(profile.avatarDataUrl).toBe('data:image/jpeg;base64,AQID')
  })

  it('rejects non-TikTok URLs', () => {
    expect(() => parseTikTokProfileReference('https://example.com/@thoms.gail')).toThrow(/TikTok invalide/i)
  })
})
