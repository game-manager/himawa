import type { CurrentStatus, PokeKind, StatusKind } from './models'

export const STATUS_OPTIONS: Array<{
  kind: StatusKind
  label: string
  shortLabel: string
  emoji: string
  durationMinutes: number
  color: string
}> = [
  { kind: 'available', label: 'いま遊べる', shortLabel: '遊べる', emoji: '👋', durationMinutes: 60, color: '#4ecb8d' },
  { kind: 'gaming', label: 'ゲーム中', shortLabel: 'ゲーム中', emoji: '🎮', durationMinutes: 120, color: '#816cff' },
  { kind: 'studying', label: '勉強中', shortLabel: '勉強中', emoji: '📚', durationMinutes: 60, color: '#4d96ff' },
  { kind: 'moving', label: '移動中', shortLabel: '移動中', emoji: '🚶', durationMinutes: 30, color: '#ff9f43' },
  { kind: 'later', label: 'あとでならOK', shortLabel: 'あとでOK', emoji: '🕒', durationMinutes: 180, color: '#e76f9b' },
  { kind: 'resting', label: '今日はゆっくり', shortLabel: 'ゆっくり', emoji: '🌙', durationMinutes: 240, color: '#5f6f94' },
  { kind: 'hidden', label: '気配を消す', shortLabel: 'オフ', emoji: '☁️', durationMinutes: 60, color: '#a8a8a8' },
]

export const POKE_OPTIONS: Array<{ kind: PokeKind; label: string; emoji: string }> = [
  { kind: 'play', label: '遊ぼ', emoji: '👋' },
  { kind: 'game', label: 'ゲームしよ', emoji: '🎮' },
  { kind: 'talk', label: 'あとで話そ', emoji: '💬' },
  { kind: 'cheer', label: 'がんばれ', emoji: '🔥' },
]

export function getStatusDefinition(status: CurrentStatus | null, now = Date.now()) {
  if (!status || status.expiresAt <= now) return null
  return STATUS_OPTIONS.find((item) => item.kind === status.kind) ?? null
}

export function getRemainingLabel(status: CurrentStatus | null, now = Date.now()) {
  if (!status || status.expiresAt <= now) return '未設定'
  const minutes = Math.max(1, Math.ceil((status.expiresAt - now) / 60_000))
  if (minutes < 60) return `あと${minutes}分`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `あと${hours}時間${rest}分` : `あと${hours}時間`
}

export function createStatus(kind: StatusKind, now = Date.now()): CurrentStatus {
  const definition = STATUS_OPTIONS.find((item) => item.kind === kind)
  if (!definition) throw new Error('Unknown status kind')
  return {
    kind,
    updatedAt: now,
    expiresAt: now + definition.durationMinutes * 60_000,
  }
}

export function pokeLabel(kind: PokeKind) {
  return POKE_OPTIONS.find((item) => item.kind === kind) ?? POKE_OPTIONS[0]
}
