import { useMemo, useState } from 'react'
import { Check, Eye, LoaderCircle, Music2, Send, Trash2 } from 'lucide-react'
import type { ActivityKind, AvailabilityLevel, CurrentStatus, Group, MusicAttachment } from '../lib/models'
import { fetchSpotifyTrack } from '../lib/spotify'
import {
  ACTIVITY_OPTIONS,
  AVAILABILITY_OPTIONS,
  availabilityOption,
  getStatusExpiry,
  normalizeStatus,
  STATUS_DURATIONS,
  type StatusDurationKey,
  VISIBILITY_LABELS,
} from '../lib/status'

type StatusDraft = {
  availability: AvailabilityLevel
  activities: ActivityKind[]
  note: string
  visibility: 'friends' | 'groups'
  expiresAt: number
  groupIds: string[]
  music?: MusicAttachment
}

export function StatusComposer({
  groups,
  currentStatus,
  busy,
  onSubmit,
}: {
  groups: Group[]
  currentStatus: CurrentStatus | null
  busy: boolean
  onSubmit: (value: StatusDraft) => void
}) {
  const current = useMemo(() => normalizeStatus(currentStatus), [currentStatus])
  const [availability, setAvailability] = useState<AvailabilityLevel>(current?.availability ?? 'free')
  const [activities, setActivities] = useState<ActivityKind[]>(current?.activities ?? [])
  const [note, setNote] = useState(current?.text && current.text !== availabilityOption(current.availability).label ? current.text : '')
  const [duration, setDuration] = useState<StatusDurationKey>('60')
  const [visibility, setVisibility] = useState<'friends' | 'groups'>(current?.visibility === 'groups' ? 'groups' : 'friends')
  const [groupIds, setGroupIds] = useState<string[]>(current?.groupIds ?? [])
  const [music, setMusic] = useState<MusicAttachment | undefined>(current?.music)
  const [musicUrl, setMusicUrl] = useState(current?.music?.url ?? '')
  const [musicLoading, setMusicLoading] = useState(false)
  const [musicError, setMusicError] = useState('')

  function toggleActivity(value: ActivityKind) {
    setActivities((currentItems) => {
      if (currentItems.includes(value)) return currentItems.filter((item) => item !== value)
      if (currentItems.length >= 2) return [currentItems[1], value]
      return [...currentItems, value]
    })
  }

  async function addMusic() {
    if (musicLoading) return
    setMusicLoading(true)
    setMusicError('')
    try {
      const track = await fetchSpotifyTrack(musicUrl)
      setMusic(track)
      setMusicUrl(track.url)
    } catch (error) {
      setMusicError(error instanceof Error && error.message === 'SPOTIFY_URL_INVALID' ? 'Spotifyの曲リンクを貼ってください' : '曲を読み込めませんでした。リンクを確認してね')
    } finally {
      setMusicLoading(false)
    }
  }

  return (
    <form className="status-composer" onSubmit={(event) => {
      event.preventDefault()
      onSubmit({ availability, activities, note, visibility, expiresAt: getStatusExpiry(duration), groupIds, music })
    }}>
      <fieldset className="status-fieldset">
        <legend>今、誘ってもいい？</legend>
        <div className="availability-options">
          {AVAILABILITY_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.value}
              className={`availability-option availability-option--${option.value} ${availability === option.value ? 'is-selected' : ''}`}
              onClick={() => setAvailability(option.value)}
              aria-pressed={availability === option.value}
            >
              <span aria-hidden="true">{option.emoji}</span>
              <strong>{option.label}</strong>
              <small>{option.description}</small>
              {availability === option.value && <Check size={16} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </fieldset>

      {availability !== 'busy' && <fieldset className="status-fieldset">
        <legend>何したい？ <small>2つまで・あとでもOK</small></legend>
        <div className="activity-options">
          {ACTIVITY_OPTIONS.map((option) => (
            <button type="button" key={option.value} className={activities.includes(option.value) ? 'is-selected' : ''} onClick={() => toggleActivity(option.value)} aria-pressed={activities.includes(option.value)}>
              <span aria-hidden="true">{option.emoji}</span>{option.label}
            </button>
          ))}
        </div>
      </fieldset>}

      <fieldset className="status-fieldset">
        <legend>いつまで？</legend>
        <div className="duration-options">
          {STATUS_DURATIONS.map((option) => <button type="button" key={option.key} className={duration === option.key ? 'is-selected' : ''} onClick={() => setDuration(option.key)} aria-pressed={duration === option.key}>{option.label}</button>)}
        </div>
      </fieldset>

      <label className="status-note-label">ひとこと <small>任意</small><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={60} placeholder="例：21時までゲームできる！" /></label>

      <fieldset className="status-fieldset status-music-fieldset">
        <legend>今聴いている曲 <small>任意・1曲まで</small></legend>
        {music ? <div className="music-attachment-preview">
          {music.thumbnailUrl ? <img src={music.thumbnailUrl} alt="" /> : <span aria-hidden="true"><Music2 size={20} /></span>}
          <div><strong>{music.title}</strong><small>Spotify</small></div>
          <button type="button" onClick={() => { setMusic(undefined); setMusicUrl(''); setMusicError('') }} aria-label={`${music.title}をステータスから外す`}><Trash2 size={16} /></button>
        </div> : <div className="music-link-input">
          <Music2 size={18} aria-hidden="true" />
          <input value={musicUrl} onChange={(event) => setMusicUrl(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addMusic() } }} inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="Spotifyの曲リンクを貼る" aria-label="Spotifyの曲リンク" />
          <button type="button" onClick={addMusic} disabled={musicLoading || !musicUrl.trim()}>{musicLoading ? <LoaderCircle className="spin" size={16} /> : '追加'}</button>
        </div>}
        {musicError && <p className="music-link-error" role="alert">{musicError}</p>}
        <p className="music-link-hint">Spotifyの「シェア」から曲のリンクをコピーして貼り付けてね。</p>
      </fieldset>

      {groups.length > 0 && <details className="status-sharing-details">
        <summary><Eye size={15} /> 公開先：{VISIBILITY_LABELS[visibility].label}</summary>
        <div className="sharing-options">
          <label><input type="radio" name="visibility" value="friends" checked={visibility === 'friends'} onChange={() => setVisibility('friends')} /> 友達だけ</label>
          <label><input type="radio" name="visibility" value="groups" checked={visibility === 'groups'} onChange={() => setVisibility('groups')} /> グループだけ</label>
        </div>
        {visibility === 'groups' && <div className="group-picker">{groups.map((group) => <label key={group.id}><input type="checkbox" checked={groupIds.includes(group.id)} onChange={() => setGroupIds((items) => items.includes(group.id) ? items.filter((id) => id !== group.id) : [...items, group.id])} /> {group.name}</label>)}</div>}
      </details>}

      <p className="privacy-hint"><Eye size={14} /> {VISIBILITY_LABELS[visibility].description}。期限が来ると自動で「今は無理」に戻ります。</p>
      <button className="primary-button status-submit-button" type="submit" disabled={busy || musicLoading || (visibility === 'groups' && groupIds.length === 0)}>{busy ? '更新中…' : availability === 'free' ? 'ひまになる 🌻' : 'この状態にする'} {!busy && <Send size={17} />}</button>
    </form>
  )
}
