import type { MusicAttachment } from './models'

type SpotifyOEmbed = {
  provider_name?: string
  title?: string
  thumbnail_url?: string
}

export function normalizeSpotifyTrackUrl(value: string) {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com') return null
    const parts = url.pathname.split('/').filter(Boolean)
    const trackIndex = parts.indexOf('track')
    const trackId = trackIndex >= 0 ? parts[trackIndex + 1] : ''
    if (!/^[A-Za-z0-9]{22}$/.test(trackId)) return null
    return { trackId, url: `https://open.spotify.com/track/${trackId}` }
  } catch {
    return null
  }
}

function safeThumbnail(value?: string) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    const allowed = url.protocol === 'https:' && (url.hostname.endsWith('.spotifycdn.com') || url.hostname.endsWith('.scdn.co'))
    return allowed ? url.href : undefined
  } catch {
    return undefined
  }
}

export async function fetchSpotifyTrack(value: string, signal?: AbortSignal): Promise<MusicAttachment> {
  const normalized = normalizeSpotifyTrackUrl(value)
  if (!normalized) throw new Error('SPOTIFY_URL_INVALID')
  const endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(normalized.url)}`
  const response = await fetch(endpoint, { signal })
  if (!response.ok) throw new Error('SPOTIFY_LOOKUP_FAILED')
  const data = await response.json() as SpotifyOEmbed
  const title = data.title?.trim().slice(0, 100)
  if (data.provider_name !== 'Spotify' || !title) throw new Error('SPOTIFY_LOOKUP_FAILED')
  const thumbnailUrl = safeThumbnail(data.thumbnail_url)
  return {
    provider: 'spotify',
    trackId: normalized.trackId,
    url: normalized.url,
    title,
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  }
}

export function spotifyEmbedUrl(trackId: string) {
  return `https://open.spotify.com/embed/track/${encodeURIComponent(trackId)}?utm_source=himawa`
}
