import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ExternalLink, Music2, Pause, Play } from 'lucide-react'
import type { MusicAttachment } from '../lib/models'
import { spotifyEmbedUrl } from '../lib/spotify'

export function formatPlaybackTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const wholeSeconds = Math.floor(seconds)
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`
}

export function MusicPreviewPlayer({ music }: { music: MusicAttachment }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setError('')
    return () => audioRef.current?.pause()
  }, [music.trackId])

  async function togglePlayback() {
    const audio = audioRef.current
    if (!audio) return
    setError('')
    if (!audio.paused) {
      audio.pause()
      setPlaying(false)
      return
    }
    if (duration > 0 && audio.currentTime >= duration - 0.1) audio.currentTime = 0
    try {
      await audio.play()
      setPlaying(true)
    } catch {
      setPlaying(false)
      setError('試聴を開始できませんでした。もう一度押してみてね。')
    }
  }

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
  const provider = music.provider === 'spotify' ? 'Spotify' : 'Apple Music'

  return <div className="status-music-player">
    <div className="status-music-player__track">
      <div className="status-music-player__art">
        {music.thumbnailUrl ? <img src={music.thumbnailUrl} alt="" /> : <span><Music2 size={25} /></span>}
        <i className={`music-equalizer ${playing ? 'is-playing' : ''}`} aria-hidden="true"><b /><b /><b /></i>
      </div>
      <div><small>NOW PLAYING · {provider}</small><strong>{music.title}</strong><p>{music.artistName || 'アーティスト情報なし'}</p></div>
    </div>

    {music.provider === 'spotify' ? <div className="status-music-player__spotify">
      <iframe src={spotifyEmbedUrl(music.trackId)} title={`${music.title}のSpotifyプレイヤー`} width="100%" height="152" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
    </div> : music.previewUrl ? <div className="status-music-player__controls">
      <audio
        ref={audioRef}
        src={music.previewUrl}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onEnded={() => setPlaying(false)}
        onError={() => { setPlaying(false); setError('この曲の試聴音源を読み込めませんでした。') }}
      />
      <button className="music-main-play" type="button" onClick={() => void togglePlayback()} aria-label={playing ? `${music.title}の試聴を一時停止` : `${music.title}を試聴`}>
        {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
      </button>
      <div className="music-timeline">
        <input
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={Math.min(currentTime, duration || 0)}
          disabled={!duration}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (audioRef.current) audioRef.current.currentTime = next
            setCurrentTime(next)
          }}
          aria-label="試聴位置"
          style={{ '--music-progress': `${progress}%` } as CSSProperties}
        />
        <div><span>{formatPlaybackTime(currentTime)}</span><span>{formatPlaybackTime(duration)}</span></div>
      </div>
    </div> : <p className="music-preview-unavailable">この曲には試聴音源がありません。</p>}

    {error && <p className="music-player-error" role="alert">{error}</p>}
    <a className={`music-player__link music-player__link--${music.provider}`} href={music.url} target="_blank" rel="noopener noreferrer">{provider}でフル再生 <ExternalLink size={14} /></a>
  </div>
}
