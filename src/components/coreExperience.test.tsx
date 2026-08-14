import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_AVATAR } from './Avatar'
import { FriendStatusCard } from './FriendStatusCard'
import { StatusComposer } from './StatusComposer'
import { NotificationPermissionPrompt } from './Dashboard'

const profile = {
  uid: 'friend-1',
  displayName: '田中さんの長い名前',
  avatar: DEFAULT_AVATAR,
  bio: '',
  discoverable: true,
}

describe('HIMAWA core experience', () => {
  it('shows an available friend, remaining time, and their preferred one-tap invitation', () => {
    const now = new Date('2026-08-14T10:00:00+09:00').getTime()
    const html = renderToStaticMarkup(<FriendStatusCard
      friend={{
        profile,
        status: {
          uid: profile.uid,
          displayName: profile.displayName,
          avatar: profile.avatar,
          availability: 'free',
          activities: ['game'],
          text: 'ひま！',
          emoji: '🟢',
          visibility: 'friends',
          updatedAt: now,
          expiresAt: now + 42 * 60_000,
          music: {
            provider: 'spotify', trackId: '11dFghVXANMlKmJXsNCbNl',
            url: 'https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl', title: 'Cut To The Feeling',
          },
        },
      }}
      now={now}
      onInvite={vi.fn()}
      onInviteOptions={vi.fn()}
      onMessage={vi.fn()}
    />)

    expect(html).toContain('ひま！')
    expect(html).toContain('ゲームしたい')
    expect(html).toContain('あと42分')
    expect(html).toContain('ゲームしよ')
    expect(html).toContain('Cut To The Feeling')
  })

  it('treats an expired status as unavailable and disables invitations', () => {
    const now = Date.now()
    const html = renderToStaticMarkup(<FriendStatusCard
      friend={{
        profile,
        status: {
          uid: profile.uid,
          displayName: profile.displayName,
          avatar: profile.avatar,
          availability: 'free',
          activities: ['talk'],
          text: 'ひま！',
          emoji: '🟢',
          visibility: 'friends',
          updatedAt: now - 90 * 60_000,
          expiresAt: now - 30_000,
        },
      }}
      now={now}
      onInvite={vi.fn()}
      onInviteOptions={vi.fn()}
      onMessage={vi.fn()}
    />)

    expect(html).toContain('今は無理')
    expect(html).toContain('disabled')
    expect(html).not.toContain('話そ')
  })

  it('keeps status setup short with three states and four expiry choices', () => {
    const html = renderToStaticMarkup(<StatusComposer groups={[]} currentStatus={null} busy={false} onSubmit={vi.fn()} />)

    expect(html).toContain('ひま！')
    expect(html).toContain('誘われたら行ける')
    expect(html).toContain('今は無理')
    expect(html).toContain('30分')
    expect(html).toContain('1時間')
    expect(html).toContain('3時間')
    expect(html).toContain('今日いっぱい')
    expect(html).toContain('Spotifyの曲リンクを貼る')
  })

  it('explains notification scope and where the choice can be changed later', () => {
    const html = renderToStaticMarkup(<NotificationPermissionPrompt busy={false} onAnswer={vi.fn()} />)

    expect(html).toContain('HIMAWAは通知を送信します')
    expect(html).toContain('DM・誘い・友達申請')
    expect(html).toContain('「自分」→「通知」で変更できます')
    expect(html).toContain('許可しない')
    expect(html).toContain('許可')
  })
})
