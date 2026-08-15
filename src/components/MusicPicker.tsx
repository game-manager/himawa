import { useEffect, useRef, useState } from 'react'
import { Link2, LoaderCircle, Music2, Pause, Play, Search, Trash2 } from 'lucide-react'
import type { MusicAttachment } from '../lib/models'
import { searchMusic } from '../lib/music'
import { fetchSpotifyTrack } from '../lib/spotify'

function providerLabel(music: MusicAttachment) {
  return music.provider === 'spotify' ? 'Spotify' : 'Apple Music'
}

export function MusicPicker({ value, onChange }: { value?: MusicAttachment; onChange: (music?: MusicAttachment) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MusicAttachment[]>([])
  const [searching, setSearching] = useState(false)
  const [searchedQuery, setSearchedQuery] = useState('')
  const [searchError, setSearchError] = useState('')
  const [spotifyUrl, setSpotifyUrl] = useState(value?.provider === 'spotify' ? value.url : '')
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [playingId, setPlayingId] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setResults([])
      setSearchedQuery('')
      setSearching(false)
      setSearchError('')
      return
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setSearching(true)
      setSearchError('')
      try {
        setResults(await searchMusic(term, controller.signal))
        setSearchedQuery(term)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setResults([])
        setSearchedQuery(term)
        setSearchError('曲を検索できませんでした。通信を確認してもう一度試してね。')
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 400)
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [query])

  useEffect(() => () => {
    audioRef.current?.pause()
    audioRef.current = null
  }, [])

  function stopPreview() {
    audioRef.current?.pause()
    audioRef.current = null
    setPlayingId('')
  }

  async function togglePreview(track: MusicAttachment) {
    if (track.provider !== 'apple' || !track.previewUrl) return
    if (playingId === track.trackId) {
      stopPreview()
      return
    }
    stopPreview()
    const audio = new Audio(track.previewUrl)
    audioRef.current = audio
    audio.addEventListener('ended', stopPreview, { once: true })
    audio.addEventListener('error', stopPreview, { once: true })
    try {
      await audio.play()
      setPlayingId(track.trackId)
    } catch {
      stopPreview()
      setSearchError('試聴を開始できませんでした。もう一度再生ボタンを押してね。')
    }
  }

  function selectTrack(track: MusicAttachment) {
    stopPreview()
    onChange(track)
    setQuery('')
    setResults([])
    setSearchError('')
  }

  async function addSpotifyLink() {
    if (linkLoading) return
    setLinkLoading(true)
    setLinkError('')
    try {
      const track = await fetchSpotifyTrack(spotifyUrl)
      stopPreview()
      onChange(track)
      setSpotifyUrl(track.url)
    } catch (error) {
      setLinkError(error instanceof Error && error.message === 'SPOTIFY_URL_INVALID' ? 'Spotifyの曲リンクを貼ってください' : '曲を読み込めませんでした。リンクを確認してね。')
    } finally {
      setLinkLoading(false)
    }
  }

  if (value) {
    const canPreview = value.provider === 'apple' && Boolean(value.previewUrl)
    return <div className={`music-attachment-preview ${canPreview ? 'has-preview' : ''}`}>
      {value.thumbnailUrl ? <img src={value.thumbnailUrl} alt="" /> : <span aria-hidden="true"><Music2 size={20} /></span>}
      <div><strong>{value.title}</strong><small>{value.artistName ? `${value.artistName} · ` : ''}{providerLabel(value)}</small></div>
      {canPreview && <button className="music-preview-button" type="button" onClick={() => void togglePreview(value)} aria-label={playingId === value.trackId ? `${value.title}の試聴を停止` : `${value.title}を試聴`}>
        {playingId === value.trackId ? <Pause size={16} /> : <Play size={16} />}
      </button>}
      <button className="music-remove-button" type="button" onClick={() => { stopPreview(); onChange(undefined); setSpotifyUrl('') }} aria-label={`${value.title}をステータスから外す`}><Trash2 size={16} /></button>
    </div>
  }

  return <div className="music-picker">
    <label className="music-search-input">
      <Search size={18} aria-hidden="true" />
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="曲名・アーティスト名で検索" autoComplete="off" />
      {searching && <LoaderCircle className="spin" size={17} aria-label="検索中" />}
    </label>
    {searchError && <p className="music-link-error" role="alert">{searchError}</p>}
    {results.length > 0 && <div className="music-search-results" aria-label="曲の検索結果">
      {results.map((track) => <article className="music-search-result" key={`${track.provider}-${track.trackId}`}>
        <button className="music-result-select" type="button" onClick={() => selectTrack(track)}>
          {track.thumbnailUrl ? <img src={track.thumbnailUrl} alt="" /> : <span aria-hidden="true"><Music2 size={19} /></span>}
          <span><strong>{track.title}</strong><small>{track.artistName}</small></span>
        </button>
        {track.provider === 'apple' && track.previewUrl && <button className="music-result-play" type="button" onClick={() => void togglePreview(track)} aria-label={playingId === track.trackId ? `${track.title}の試聴を停止` : `${track.title}を試聴`}>
          {playingId === track.trackId ? <Pause size={16} /> : <Play size={16} />}
        </button>}
      </article>)}
    </div>}
    {!searching && searchedQuery && !searchError && results.length === 0 && <p className="music-search-empty">「{searchedQuery}」に一致する曲がありませんでした。</p>}
    <p className="music-link-hint">検索結果はApple Musicから取得します。再生ボタンで試聴できます。</p>
    <details className="spotify-link-details">
      <summary><Link2 size={14} /> Spotifyリンクから追加</summary>
      <div className="music-link-input">
        <Music2 size={18} aria-hidden="true" />
        <input value={spotifyUrl} onChange={(event) => setSpotifyUrl(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addSpotifyLink() } }} inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://open.spotify.com/track/..." aria-label="Spotifyの曲リンク" />
        <button type="button" onClick={() => void addSpotifyLink()} disabled={linkLoading || !spotifyUrl.trim()}>{linkLoading ? <LoaderCircle className="spin" size={16} /> : '追加'}</button>
      </div>
      {linkError && <p className="music-link-error" role="alert">{linkError}</p>}
    </details>
  </div>
}
