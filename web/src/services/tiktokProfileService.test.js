import { describe, expect, it } from 'vitest'
import { getTikTokHandle, normalizeTikTokProfileUrl } from './tiktokProfileService'

describe('TikTok profile URL normalization', () => {
  it('normalizes a public profile URL', () => {
    expect(normalizeTikTokProfileUrl('https://m.tiktok.com/@creator.name?lang=fr'))
      .toBe('https://www.tiktok.com/@creator.name')
  })

  it('accepts a bare handle', () => {
    expect(getTikTokHandle('@creator_name')).toBe('creator_name')
  })

  it('rejects non-TikTok hosts', () => {
    expect(() => normalizeTikTokProfileUrl('https://example.com/@creator'))
      .toThrow(/tiktok\.com/i)
  })
})
