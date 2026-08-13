import { useState, type FormEvent } from 'react'
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth'
import { ArrowRight, LockKeyhole, MapPinOff, Sparkles } from 'lucide-react'
import { auth } from '../lib/firebase'

function authErrorMessage(code?: string) {
  if (code === 'auth/email-already-in-use') return 'このメールアドレスは登録済みです。'
  if (code === 'auth/invalid-credential') return 'メールアドレスかパスワードが違います。'
  if (code === 'auth/weak-password') return 'パスワードは6文字以上にしてください。'
  if (code === 'auth/invalid-email') return 'メールアドレスを確認してください。'
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Googleログインをキャンセルしました。'
  if (code === 'auth/popup-blocked') return 'Googleログインの画面を開けませんでした。ポップアップを許可してください。'
  if (code === 'auth/unauthorized-domain') return 'このURLではGoogleログインを利用できません。管理者に連絡してください。'
  if (code === 'auth/operation-not-allowed') return 'Googleログインは現在準備中です。少し待ってから試してください。'
  if (code === 'auth/account-exists-with-different-credential') return '同じメールアドレスのアカウントがあります。先にメールアドレスでログインしてください。'
  return 'うまく接続できませんでした。少し待って、もう一度試してください。'
}

export function AuthScreen() {
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [helpMessage, setHelpMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setHelpMessage('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth, email.trim(), password)
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      }
    } catch (reason) {
      const code = typeof reason === 'object' && reason && 'code' in reason ? String(reason.code) : undefined
      setError(authErrorMessage(code))
    } finally {
      setLoading(false)
    }
  }

  async function resetPassword() {
    setError('')
    setHelpMessage('')
    const loginEmail = email.trim()
    if (!loginEmail) {
      setError('パスワード用のログインメールを入力してください。')
      return
    }
    setLoading(true)
    try {
      auth.languageCode = 'ja'
      await sendPasswordResetEmail(auth, loginEmail)
      setHelpMessage('パスワード再設定メールを送信しました。届かない場合は、Googleでログインして設定の「ログイン方法」を確認してください。')
    } catch (reason) {
      const code = typeof reason === 'object' && reason && 'code' in reason ? String(reason.code) : undefined
      setError(authErrorMessage(code))
    } finally {
      setLoading(false)
    }
  }

  async function signInWithGoogle() {
    setError('')
    setLoading(true)
    try {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await signInWithPopup(auth, provider)
    } catch (reason) {
      const code = typeof reason === 'object' && reason && 'code' in reason ? String(reason.code) : undefined
      setError(authErrorMessage(code))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <div className="brand-mark" aria-hidden="true"><span /></div>
        <p className="eyebrow">放課後の気配SNS</p>
        <h1>HIMAWA</h1>
        <p className="hero-copy">「ひま？」って聞く、<br />その前に。</p>
        <div className="feature-chips" aria-label="HIMAWAの特徴">
          <span><Sparkles size={15} /> 友達だけ</span>
          <span><MapPinOff size={15} /> 位置情報なし</span>
          <span><LockKeyhole size={15} /> 履歴なし</span>
        </div>
      </section>

      <section className="auth-card">
        <div className="segmented" role="tablist" aria-label="登録またはログイン">
          <button className={mode === 'signup' ? 'is-active' : ''} onClick={() => setMode('signup')}>はじめる</button>
          <button className={mode === 'login' ? 'is-active' : ''} onClick={() => setMode('login')}>ログイン</button>
        </div>
        <form onSubmit={submit}>
          <label>
            メールアドレス
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required />
          </label>
          <label>
            パスワード
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder="6文字以上" minLength={6} required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {helpMessage && <p className="form-success" role="status">{helpMessage}</p>}
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? 'つないでいます…' : mode === 'signup' ? '無料ではじめる' : 'ログインする'}
            {!loading && <ArrowRight size={18} />}
          </button>
          {mode === 'login' && <button className="login-help-button" type="button" onClick={resetPassword} disabled={loading}>パスワードを忘れた・メール変更後に入れない</button>}
        </form>
        <div className="auth-divider"><span>または</span></div>
        <button className="google-auth-button" type="button" onClick={signInWithGoogle} disabled={loading}>
          <span className="google-glyph" aria-hidden="true">G</span>
          Googleで{mode === 'signup' ? 'はじめる' : 'ログイン'}
        </button>
        <p className="fine-print">13歳以上向け。登録すると利用ルールとプライバシー方針に同意したものとみなされます。</p>
      </section>
    </main>
  )
}
