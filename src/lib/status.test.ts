import { describe, expect, it } from 'vitest'
import type { CurrentStatus } from './models'
import { createStatus, getRemainingLabel, normalizeStatus } from './status'

describe('status helpers', () => {
  it('creates an expiring free-text status', () => {
    const status = createStatus('放課後あそべる', '🌻', 'friends', 60, [], 1_000)
    expect(status.expiresAt).toBe(3_601_000)
    expect(status.text).toBe('放課後あそべる')
  })

  it('hides expired statuses', () => {
    const status = { text: 'ゲーム中', emoji: '🎮', visibility: 'friends', updatedAt: 0, expiresAt: 999 } as CurrentStatus
    expect(normalizeStatus(status, 1_000)).toBeNull()
    expect(getRemainingLabel(status, 1_000)).toBe('まだ設定していません')
  })

  it('formats the remaining time', () => {
    const status = { text: 'あとで', emoji: '🌙', visibility: 'public', updatedAt: 0, expiresAt: 5_401_000 } as CurrentStatus
    expect(getRemainingLabel(status, 1_000)).toBe('あと1時間30分')
  })

  it('keeps old preset statuses readable', () => {
    const legacy = { kind: 'gaming', updatedAt: 0, expiresAt: 5_000 } as CurrentStatus
    expect(normalizeStatus(legacy, 1_000)?.text).toBe('ゲーム中')
  })
})
