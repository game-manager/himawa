import { describe, expect, it } from 'vitest'
import { avatarImageError, avatarWithoutPhoto } from './avatarImage'

describe('avatar image helpers', () => {
  it('accepts supported images within the source limit', () => {
    expect(avatarImageError({ type: 'image/jpeg', size: 2_000_000 })).toBe('')
    expect(avatarImageError({ type: 'image/svg+xml', size: 1_000 })).toContain('JPEG')
    expect(avatarImageError({ type: 'image/png', size: 11 * 1024 * 1024 })).toContain('10MB')
  })

  it('returns the part avatar without an uploaded photo', () => {
    expect(avatarWithoutPhoto({ skin: 'peach', hair: 'ink', outfit: 'tomato', background: 'cream', photoUrl: 'data:image/jpeg;base64,abc' })).toEqual({
      skin: 'peach', hair: 'ink', outfit: 'tomato', background: 'cream',
    })
  })
})
