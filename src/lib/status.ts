import type {
  ActivityKind,
  AvailabilityLevel,
  CurrentStatus,
  LegacyStatusKind,
  PokeKind,
  StatusVisibility,
} from './models'

const LEGACY_STATUS: Record<LegacyStatusKind, { text: string; emoji: string; availability: AvailabilityLevel }> = {
  available: { text: 'いま遊べる', emoji: '🌻', availability: 'free' },
  gaming: { text: 'ゲーム中', emoji: '🎮', availability: 'maybe' },
  studying: { text: '勉強中', emoji: '📚', availability: 'busy' },
  moving: { text: '移動中', emoji: '🚲', availability: 'maybe' },
  later: { text: 'あとでならOK', emoji: '🌙', availability: 'maybe' },
  resting: { text: '今日はゆっくり', emoji: '☕', availability: 'busy' },
  hidden: { text: '気配はオフ', emoji: '○', availability: 'busy' },
}

export const AVAILABILITY_OPTIONS: Array<{
  value: AvailabilityLevel
  label: string
  shortLabel: string
  emoji: string
  description: string
}> = [
  { value: 'free', label: 'ひま！', shortLabel: 'ひま！', emoji: '🟢', description: '今すぐ誘ってOK' },
  { value: 'maybe', label: '誘われたら行ける', shortLabel: '誘われたらOK', emoji: '🟡', description: 'いい誘いがあれば参加したい' },
  { value: 'busy', label: '今は無理', shortLabel: '今は無理', emoji: '⚫', description: '今は誘わないでほしい' },
]

export const ACTIVITY_OPTIONS: Array<{
  value: ActivityKind
  emoji: string
  label: string
  statusLabel: string
  inviteLabel: string
  pokeKind: PokeKind
}> = [
  { value: 'game', emoji: '🎮', label: 'ゲーム', statusLabel: 'ゲームしたい', inviteLabel: 'ゲームしよ', pokeKind: 'game' },
  { value: 'food', emoji: '🍔', label: 'ごはん', statusLabel: 'ごはん行きたい', inviteLabel: 'ごはん行こ', pokeKind: 'play' },
  { value: 'outing', emoji: '🚶', label: '出かける', statusLabel: '出かけたい', inviteLabel: '出かけよ', pokeKind: 'play' },
  { value: 'talk', emoji: '💬', label: '話す', statusLabel: '話したい', inviteLabel: '話そ', pokeKind: 'talk' },
  { value: 'sports', emoji: '⚽', label: '遊ぶ', statusLabel: '遊びたい', inviteLabel: '遊ぼ', pokeKind: 'play' },
  { value: 'study', emoji: '📚', label: '勉強', statusLabel: '一緒に勉強したい', inviteLabel: '勉強しよ', pokeKind: 'cheer' },
  { value: 'other', emoji: '✨', label: 'その他', statusLabel: '何かしたい', inviteLabel: '何かしよ', pokeKind: 'play' },
]

export type StatusDurationKey = '30' | '60' | '180' | 'today'

export const STATUS_DURATIONS: Array<{ key: StatusDurationKey; minutes?: number; label: string }> = [
  { key: '30', minutes: 30, label: '30分' },
  { key: '60', minutes: 60, label: '1時間' },
  { key: '180', minutes: 180, label: '3時間' },
  { key: 'today', label: '今日いっぱい' },
]

export const VISIBILITY_LABELS: Record<StatusVisibility, { label: string; description: string }> = {
  friends: { label: '友達だけ', description: 'お互いに友達の人へ表示' },
  followers: { label: 'フォロワーまで', description: 'あなたをフォローしている人へ表示' },
  public: { label: 'みんなに公開', description: 'HIMAWAを使っている人へ表示' },
  groups: { label: 'グループだけ', description: '選んだグループのメンバーへ表示' },
}

export const POKE_OPTIONS: Array<{ kind: PokeKind; label: string; emoji: string }> = [
  { kind: 'play', label: '遊ぼう', emoji: '🌻' },
  { kind: 'game', label: 'ゲームしよ', emoji: '🎮' },
  { kind: 'talk', label: '話そ', emoji: '💬' },
  { kind: 'cheer', label: '一緒にがんばろ', emoji: '📚' },
]

export function availabilityOption(value: AvailabilityLevel) {
  return AVAILABILITY_OPTIONS.find((item) => item.value === value) ?? AVAILABILITY_OPTIONS[2]
}

export function activityOption(value?: ActivityKind | null) {
  return ACTIVITY_OPTIONS.find((item) => item.value === value) ?? null
}

export function getAvailability(status: CurrentStatus | null): AvailabilityLevel {
  if (!status) return 'busy'
  if (status.availability) return status.availability
  if (status.kind) return LEGACY_STATUS[status.kind].availability
  return 'maybe'
}

export function normalizeStatus(status: CurrentStatus | null, now = Date.now()) {
  if (!status || status.expiresAt <= now) return null
  const legacy = status.kind ? LEGACY_STATUS[status.kind] : null
  const availability = status.availability ?? legacy?.availability ?? 'maybe'
  const option = availabilityOption(availability)
  return {
    ...status,
    availability,
    activities: status.activities ?? [],
    text: status.text || legacy?.text || option.label,
    emoji: status.emoji || legacy?.emoji || option.emoji,
    visibility: status.visibility || 'friends',
  }
}

export function getRemainingLabel(status: CurrentStatus | null, now = Date.now()) {
  if (!status || status.expiresAt <= now) return '期限切れ'
  const minutes = Math.max(1, Math.ceil((status.expiresAt - now) / 60_000))
  if (minutes < 60) return `あと${minutes}分`
  if (minutes <= 180) {
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return rest ? `あと${hours}時間${rest}分` : `あと${hours}時間`
  }
  return `${new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false }).format(status.expiresAt)}まで`
}

export function getUpdatedLabel(status: CurrentStatus | null, now = Date.now()) {
  if (!status?.updatedAt) return ''
  const minutes = Math.max(0, Math.floor((now - status.updatedAt) / 60_000))
  if (minutes < 1) return 'たった今更新'
  if (minutes < 60) return `${minutes}分前に更新`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}時間前に更新`
  return '昨日以前に更新'
}

export function getStatusExpiry(duration: StatusDurationKey, now = Date.now()) {
  if (duration !== 'today') return now + Number(duration) * 60_000
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return end.getTime()
}

export function createAvailabilityStatus(
  availability: AvailabilityLevel,
  activities: ActivityKind[],
  note: string,
  visibility: StatusVisibility,
  expiresAt: number,
  groupIds: string[] = [],
  now = Date.now(),
): CurrentStatus {
  const option = availabilityOption(availability)
  return {
    availability,
    activities: availability === 'busy' ? [] : activities.slice(0, 2),
    text: note.trim() || option.label,
    emoji: option.emoji,
    visibility,
    groupIds,
    updatedAt: now,
    expiresAt,
  }
}

// Kept for existing data migrations and older callers.
export function createStatus(text: string, emoji: string, visibility: StatusVisibility, durationMinutes: number, groupIds: string[] = [], now = Date.now()): CurrentStatus {
  return { text: text.trim(), emoji, visibility, groupIds, updatedAt: now, expiresAt: now + durationMinutes * 60_000 }
}

export function pokeLabel(kind: PokeKind) {
  return POKE_OPTIONS.find((item) => item.kind === kind) ?? POKE_OPTIONS[0]
}
