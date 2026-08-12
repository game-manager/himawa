import type { CurrentStatus, LegacyStatusKind, PokeKind, StatusVisibility } from './models'

const LEGACY_STATUS: Record<LegacyStatusKind, { text: string; emoji: string }> = {
  available: { text: 'いま遊べる', emoji: '🌱' },
  gaming: { text: 'ゲーム中', emoji: '🎮' },
  studying: { text: '勉強中', emoji: '📚' },
  moving: { text: '移動中', emoji: '🚲' },
  later: { text: 'あとでならOK', emoji: '🌙' },
  resting: { text: '今日はゆっくり', emoji: '☕' },
  hidden: { text: '気配はオフ', emoji: '○' },
}

export const STATUS_EMOJIS = ['🌻', '🌱', '🎮', '📚', '🎧', '☕', '🚲', '💬', '🌙', '✨']

export const STATUS_DURATIONS = [
  { minutes: 30, label: '30分' },
  { minutes: 60, label: '1時間' },
  { minutes: 120, label: '2時間' },
  { minutes: 240, label: '4時間' },
]

export const VISIBILITY_LABELS: Record<StatusVisibility, { label: string; description: string }> = {
  friends: { label: '友達だけ', description: 'お互いに友達の人へ表示' },
  followers: { label: 'フォロワーまで', description: 'あなたをフォローしている人へ表示' },
  public: { label: 'みんなに公開', description: 'HIMAWAを使っている人へ表示' },
  groups: { label: 'グループだけ', description: '選んだグループのメンバーへ表示' },
}

export const POKE_OPTIONS: Array<{ kind: PokeKind; label: string; emoji: string }> = [
  { kind: 'play', label: '遊ぼう', emoji: '🌱' },
  { kind: 'game', label: 'ゲームしよ', emoji: '🎮' },
  { kind: 'talk', label: 'あとで話そう', emoji: '💬' },
  { kind: 'cheer', label: 'がんばれ', emoji: '🌻' },
]

export function normalizeStatus(status: CurrentStatus | null, now = Date.now()) {
  if (!status || status.expiresAt <= now) return null
  const legacy = status.kind ? LEGACY_STATUS[status.kind] : null
  return {
    ...status,
    text: status.text || legacy?.text || 'いまを共有中',
    emoji: status.emoji || legacy?.emoji || '🌻',
    visibility: status.visibility || 'friends',
  }
}

export function getRemainingLabel(status: CurrentStatus | null, now = Date.now()) {
  if (!status || status.expiresAt <= now) return 'まだ設定していません'
  const minutes = Math.max(1, Math.ceil((status.expiresAt - now) / 60_000))
  if (minutes < 60) return `あと${minutes}分`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `あと${hours}時間${rest}分` : `あと${hours}時間`
}

export function createStatus(text: string, emoji: string, visibility: StatusVisibility, durationMinutes: number, groupIds: string[] = [], now = Date.now()): CurrentStatus {
  return { text: text.trim(), emoji, visibility, groupIds, updatedAt: now, expiresAt: now + durationMinutes * 60_000 }
}

export function pokeLabel(kind: PokeKind) {
  return POKE_OPTIONS.find((item) => item.kind === kind) ?? POKE_OPTIONS[0]
}
