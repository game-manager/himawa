import { describe, expect, it } from 'vitest'
import { createStatus, getRemainingLabel, getStatusDefinition } from './status'

describe('status helpers', () => {
  it('creates an expiring status', () => {
    const status = createStatus('available', 1_000)
    expect(status.expiresAt).toBe(3_601_000)
  })

  it('hides expired statuses', () => {
    const status = { kind: 'gaming' as const, updatedAt: 0, expiresAt: 999 }
    expect(getStatusDefinition(status, 1_000)).toBeNull()
    expect(getRemainingLabel(status, 1_000)).toBe('未設定')
  })

  it('formats the remaining time', () => {
    const status = { kind: 'later' as const, updatedAt: 0, expiresAt: 5_401_000 }
    expect(getRemainingLabel(status, 1_000)).toBe('あと1時間30分')
  })
})
