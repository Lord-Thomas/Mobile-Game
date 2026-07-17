import { describe, expect, it } from 'vitest'
import { normalizeYouTubeChannelUrl } from './youtubeChannelService'

describe('YouTube channel URL normalization', () => {
  it('normalizes a handle and strips channel subpages', () => {
    expect(normalizeYouTubeChannelUrl('https://youtube.com/@UneChaine/videos?view=0'))
      .toBe('https://www.youtube.com/@UneChaine')
  })

  it('accepts a bare handle', () => {
    expect(normalizeYouTubeChannelUrl('@UneChaine'))
      .toBe('https://www.youtube.com/@UneChaine')
  })

  it('rejects non-YouTube hosts', () => {
    expect(() => normalizeYouTubeChannelUrl('https://example.com/@UneChaine'))
      .toThrow(/youtube\.com/i)
  })
})
