import type { MusicAttachment } from './models'

type ItunesSong = {
  wrapperType?: string
  kind?: string
  trackId?: number
  trackName?: string
  artistName?: string
  trackViewUrl?: string
  artworkUrl100?: string
  previewUrl?: string
}

type ItunesSearchResponse = {
  results?: ItunesSong[]
}

function safeUrl(value: string | undefined, allowedHost: (hostname: string) => boolean) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && allowedHost(url.hostname) ? url.href : undefined
  } catch {
    return undefined
  }
}

function isAppleHost(hostname: string) {
  return hostname === 'music.apple.com' || hostname === 'itunes.apple.com' || hostname.endsWith('.itunes.apple.com')
}

function toMusicAttachment(song: ItunesSong): MusicAttachment | null {
  const trackId = String(song.trackId ?? '')
  const title = song.trackName?.trim().slice(0, 100)
  const artistName = song.artistName?.trim().slice(0, 100)
  const url = safeUrl(song.trackViewUrl, isAppleHost)
  if (song.wrapperType !== 'track' || song.kind !== 'song' || !/^\d+$/.test(trackId) || !title || !artistName || !url) return null

  const thumbnailUrl = safeUrl(song.artworkUrl100, (hostname) => hostname === 'mzstatic.com' || hostname.endsWith('.mzstatic.com'))
  const previewUrl = safeUrl(song.previewUrl, isAppleHost)
  return {
    provider: 'apple',
    trackId,
    url,
    title,
    artistName,
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(previewUrl ? { previewUrl } : {}),
  }
}

export async function searchMusic(query: string, signal?: AbortSignal): Promise<MusicAttachment[]> {
  const term = query.trim()
  if (term.length < 2) return []
  const params = new URLSearchParams({
    term,
    country: 'JP',
    media: 'music',
    entity: 'song',
    limit: '12',
    lang: 'ja_jp',
    explicit: 'No',
  })
  const response = await fetch(`https://itunes.apple.com/search?${params}`, { signal })
  if (!response.ok) throw new Error('MUSIC_SEARCH_FAILED')
  const data = await response.json() as ItunesSearchResponse
  return (data.results ?? []).map(toMusicAttachment).filter((track): track is MusicAttachment => track !== null)
}
