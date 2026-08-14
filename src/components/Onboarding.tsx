import { useState, type FormEvent } from 'react'
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { ArrowRight, Check, Shuffle } from 'lucide-react'
import { db } from '../lib/firebase'
import type { AvatarConfig } from '../lib/models'
import { Avatar, DEFAULT_AVATAR } from './Avatar'

const avatarChoices: Array<{ key: keyof AvatarConfig; label: string; values: string[] }> = [
  { key: 'skin', label: '肌', values: ['peach', 'honey', 'cocoa', 'rose'] },
  { key: 'hair', label: '髪', values: ['ink', 'chestnut', 'coral', 'violet'] },
  { key: 'outfit', label: '服', values: ['tomato', 'mint', 'blue', 'yellow'] },
  { key: 'background', label: '背景', values: ['cream', 'pink', 'sky', 'lilac'] },
]

function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

function randomAvatar(): AvatarConfig {
  return Object.fromEntries(
    avatarChoices.map((choice) => [choice.key, choice.values[Math.floor(Math.random() * choice.values.length)]]),
  ) as AvatarConfig
}

export function Onboarding({ user }: { user: User }) {
  const [displayName, setDisplayName] = useState('')
  const [avatar, setAvatar] = useState<AvatarConfig>(DEFAULT_AVATAR)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function save(event: FormEvent) {
    event.preventDefault()
    const name = displayName.trim()
    if (name.length < 2 || name.length > 12) {
      setError('名前は2〜12文字で入力してください。')
      return
    }
    setSaving(true)
    setError('')
    try {
      let created = false
      for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
        const friendCode = randomCode()
        try {
          await runTransaction(db, async (transaction) => {
            const codeRef = doc(db, 'codes', friendCode)
            if ((await transaction.get(codeRef)).exists()) throw new Error('CODE_COLLISION')
            transaction.set(doc(db, 'users', user.uid), {
              uid: user.uid,
              displayName: name,
              friendCode,
              avatar,
              currentStatus: null,
              defaultStatusVisibility: 'friends',
              discoverable: true,
              bio: '',
              createdAt: serverTimestamp(),
            })
            transaction.set(codeRef, { uid: user.uid, displayName: name, friendCode })
            transaction.set(doc(db, 'publicProfiles', user.uid), {
              uid: user.uid,
              displayName: name,
              avatar,
              bio: '',
              discoverable: true,
              updatedAt: serverTimestamp(),
            })
          })
          created = true
        } catch (reason) {
          if (!(reason instanceof Error) || reason.message !== 'CODE_COLLISION') throw reason
        }
      }
      if (!created) throw new Error('CODE_CREATION_FAILED')
    } catch (reason) {
      if (reason instanceof Error && reason.message === 'CODE_COLLISION') {
        setError('コードの作成に失敗しました。もう一度試してください。')
      } else {
        setError('プロフィールを保存できませんでした。もう一度試してください。')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="onboarding-page">
      <header className="onboarding-header">
        <div className="mini-brand"><span className="mini-brand__dot" /> HIMAWA</div>
        <span className="step-label">30秒で準備完了</span>
      </header>
      <section className="onboarding-card">
        <p className="eyebrow">はじめまして</p>
        <h1>友達に見える<br />自分をつくろう</h1>
        <div className="avatar-preview">
          <Avatar config={avatar} size="large" status="🌻" />
          <button className="shuffle-button" type="button" onClick={() => setAvatar(randomAvatar())} aria-label="アバターをランダムに変更">
            <Shuffle size={18} />
          </button>
        </div>

        <div className="onboarding-customizer">
          <div className="onboarding-value"><span>1</span><p><strong>名前とアイコンを決める</strong><small>次のホームで友達追加と「ひま！」をすぐ試せます。</small></p></div>
          <div className="avatar-options">
            {avatarChoices.map((choice) => (
              <div className="avatar-option-row" key={choice.key}>
                <span>{choice.label}</span>
                <div>
                  {choice.values.map((value) => (
                    <button
                      type="button"
                      key={value}
                      className={`swatch swatch--${choice.key}-${value} ${avatar[choice.key] === value ? 'is-selected' : ''}`}
                      onClick={() => setAvatar((current) => ({ ...current, [choice.key]: value }))}
                      aria-label={`${choice.label}を${value}にする`}
                    >
                      {avatar[choice.key] === value && <Check size={14} />}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={save} className="name-form">
            <label>
              友達に見せる名前
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="例：はる" maxLength={12} autoFocus required />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? '準備中…' : 'ホームへ進む'} {!saving && <ArrowRight size={18} />}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
