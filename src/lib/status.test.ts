import { describe, expect, it } from 'vitest'
import type { CurrentStatus } from './models'
import { createAvailabilityStatus, createStatus, getRemainingLabel, getStatusExpiry, getUpdatedLabel, normalizeStatus } from './status'

describe('status helpers', () => {
  it('creates an expiring free-text status', () => {
    const status = createStatus('放課後あそべる', '🌻', 'friends', 60, [], 1_000)
    expect(status.expiresAt).toBe(3_601_000)
    expect(status.text).toBe('放課後あそべる')
  })

  it('hides expired statuses', () => {
    const status = { text: 'ゲーム中', emoji: '🎮', visibility: 'friends', updatedAt: 0, expiresAt: 999 } as CurrentStatus
    expect(normalizeStatus(status, 1_000)).toBeNull()
    expect(getRemainingLabel(status, 1_000)).toBe('期限切れ')
  })

  it('formats the remaining time', () => {
    const status = { text: 'あとで', emoji: '🌙', visibility: 'public', updatedAt: 0, expiresAt: 5_401_000 } as CurrentStatus
    expect(getRemainingLabel(status, 1_000)).toBe('あと1時間30分')
  })

  it('keeps old preset statuses readable', () => {
    const legacy = { kind: 'gaming', updatedAt: 0, expiresAt: 5_000 } as CurrentStatus
    expect(normalizeStatus(legacy, 1_000)?.text).toBe('ゲーム中')
  })

  it('creates a three-level availability status with at most two activities', () => {
    const status = createAvailabilityStatus('free', ['game', 'talk', 'food'], '', 'friends', 61_000, [], 1_000)
    expect(status.availability).toBe('free')
    expect(status.activities).toEqual(['game', 'talk'])
    expect(status.text).toBe('ひま！')
  })

  it('formats long expiry as a natural end time', () => {
    const status = { text: 'ひま', emoji: '🟢', visibility: 'friends', updatedAt: 0, expiresAt: new Date(2026, 7, 14, 18, 0).getTime() } as CurrentStatus
    const now = new Date(2026, 7, 14, 12, 0).getTime()
    expect(getRemainingLabel(status, now)).toContain('18:00')
  })

  it('expires today at the end of the local day and formats update age', () => {
    const now = new Date(2026, 7, 14, 20, 0).getTime()
    expect(new Date(getStatusExpiry('today', now)).getHours()).toBe(23)
    const status = { text: 'ひま', emoji: '🟢', visibility: 'friends', updatedAt: now - 5 * 60_000, expiresAt: now + 60_000 } as CurrentStatus
    expect(getUpdatedLabel(status, now)).toBe('5分前に更新')
  })
})
