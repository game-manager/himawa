import { describe, expect, it } from 'vitest'
import { getAuthMethodEmails } from './authMethods'

describe('getAuthMethodEmails', () => {
  it('keeps password and Google sign-in addresses separate', () => {
    expect(getAuthMethodEmails([
      { providerId: 'password', email: 'login@example.com' },
      { providerId: 'google.com', email: 'google@gmail.com' },
    ])).toEqual({ passwordEmail: 'login@example.com', googleEmail: 'google@gmail.com' })
  })

  it('supports a Google-only account', () => {
    expect(getAuthMethodEmails([{ providerId: 'google.com', email: 'google@gmail.com' }]))
      .toEqual({ passwordEmail: null, googleEmail: 'google@gmail.com' })
  })

  it('ignores unrelated providers', () => {
    expect(getAuthMethodEmails([{ providerId: 'phone', email: null }]))
      .toEqual({ passwordEmail: null, googleEmail: null })
  })
})
