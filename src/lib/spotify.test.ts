import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSpotifyTrack, normalizeSpotifyTrackUrl, spotifyEmbedUrl } from './spotify'

afterEach(() => vi.unstubAllGlobals())

describe('Spotify status music helpers', () => {
  it('normalizes regular and localized Spotify track links', () => {
    expect(normalizeSpotifyTrackUrl('https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl?si=abc')).toEqual({
      trackId: '11dFghVXANMlKmJXsNCbNl',
      url: 'https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl',
    })
    expect(normalizeSpotifyTrackUrl('https://open.spotify.com/intl-ja/track/11dFghVXANMlKmJXsNCbNl')).not.toBeNull()
  })

  it('rejects non-track and untrusted links', () => {
    expect(normalizeSpotifyTrackUrl('https://example.com/track/11dFghVXANMlKmJXsNCbNl')).toBeNull()
    expect(normalizeSpotifyTrackUrl('https://open.spotify.com/album/11dFghVXANMlKmJXsNCbNl')).toBeNull()
    expect(normalizeSpotifyTrackUrl('not a url')).toBeNull()
  })

  it('builds an official Spotify embed URL', () => {
    expect(spotifyEmbedUrl('11dFghVXANMlKmJXsNCbNl')).toContain('/embed/track/11dFghVXANMlKmJXsNCbNl')
  })

  it('keeps only sanitized metadata from Spotify oEmbed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      provider_name: 'Spotify', title: '  Cut To The Feeling  ',
      thumbnail_url: 'https://image-cdn-ak.spotifycdn.com/image/example',
    }), { status: 200 })))

    await expect(fetchSpotifyTrack('https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl')).resolves.toEqual({
      provider: 'spotify', trackId: '11dFghVXANMlKmJXsNCbNl',
      url: 'https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl', title: 'Cut To The Feeling',
      thumbnailUrl: 'https://image-cdn-ak.spotifycdn.com/image/example',
    })
  })
})
