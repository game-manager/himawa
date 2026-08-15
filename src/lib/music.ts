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
  const data = typeof document === 'undefined'
    ? await fetchMusic(params, signal)
    : await searchMusicWithJsonp(params, signal)
  return (data.results ?? []).map(toMusicAttachment).filter((track): track is MusicAttachment => track !== null)
}

async function fetchMusic(params: URLSearchParams, signal?: AbortSignal) {
  const response = await fetch(`https://itunes.apple.com/search?${params}`, { signal })
  if (!response.ok) throw new Error('MUSIC_SEARCH_FAILED')
  return response.json() as Promise<ItunesSearchResponse>
}

function searchMusicWithJsonp(params: URLSearchParams, signal?: AbortSignal) {
  return new Promise<ItunesSearchResponse>((resolve, reject) => {
    const callbackName = `himawaMusic_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const callbacks = window as unknown as Record<string, unknown>
    const script = document.createElement('script')
    const timeout = window.setTimeout(() => finish(() => reject(new Error('MUSIC_SEARCH_TIMEOUT'))), 10_000)

    function cleanup() {
      window.clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
      script.remove()
      delete callbacks[callbackName]
    }

    function finish(action: () => void) {
      cleanup()
      action()
    }

    function abort() {
      finish(() => reject(new DOMException('Aborted', 'AbortError')))
    }

    callbacks[callbackName] = (data: ItunesSearchResponse) => finish(() => resolve(data))
    script.async = true
    script.referrerPolicy = 'no-referrer'
    script.src = `https://itunes.apple.com/search?${params}&callback=${encodeURIComponent(callbackName)}`
    script.onerror = () => finish(() => reject(new Error('MUSIC_SEARCH_FAILED')))
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) return abort()
    document.head.append(script)
  })
}
