import { describe, expect, it } from 'vitest'
import { appUrlForOrigin, decodeFirestoreFields, validId, validSubscription, validUid } from './validation'

describe('push worker validation', () => {
  it('decodes the Firestore REST value format', () => {
    expect(decodeFirestoreFields({
      name: { stringValue: 'ひまわ' },
      active: { booleanValue: true },
      participants: { arrayValue: { values: [{ stringValue: 'a' }, { stringValue: 'b' }] } },
    })).toEqual({ name: 'ひまわ', active: true, participants: ['a', 'b'] })
  })

  it('accepts Firebase ids but rejects paths and malformed ids', () => {
    expect(validId('uidA_uidB')).toBe(true)
    expect(validId('users/uid')).toBe(false)
    expect(validUid('abcDEF_123')).toBe(true)
    expect(validUid('short')).toBe(false)
  })

  it('requires a complete HTTPS push subscription', () => {
    expect(validSubscription({ endpoint: 'https://push.example/device', expirationTime: null, keys: { auth: 'a', p256dh: 'b' } })).toBe(true)
    expect(validSubscription({ endpoint: 'http://push.example/device', keys: { auth: 'a', p256dh: 'b' } })).toBe(false)
    expect(validSubscription({ endpoint: 'https://push.example/device', keys: { auth: '', p256dh: 'b' } })).toBe(false)
  })

  it('keeps only an approved app origin and its install path', () => {
    const allowed = 'https://himawa-social-2026.web.app,https://game-manager.github.io'
    expect(appUrlForOrigin('https://game-manager.github.io/himawa/?old=1#x', allowed)).toBe('https://game-manager.github.io/himawa/')
    expect(appUrlForOrigin('https://evil.example/himawa/', allowed)).toBeNull()
  })
})
