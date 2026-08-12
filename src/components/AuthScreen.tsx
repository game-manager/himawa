import { useState, type FormEvent } from 'react'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import { ArrowRight, LockKeyhole, MapPinOff, Sparkles } from 'lucide-react'
import { auth } from '../lib/firebase'

function authErrorMessage(code?: string) {
  if (code === 'auth/email-already-in-use') return 'このメールアドレスは登録済みです。'
  if (code === 'auth/invalid-credential') return 'メールアドレスかパスワードが違います。'
  if (code === 'auth/weak-password') return 'パスワードは6文字以上にしてください。'
  if (code === 'auth/invalid-email') return 'メールアドレスを確認してください。'
  return 'うまく接続できませんでした。少し待って、もう一度試してください。'
}

export function AuthScreen() {
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
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
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? 'つないでいます…' : mode === 'signup' ? '無料ではじめる' : 'ログインする'}
            {!loading && <ArrowRight size={18} />}
          </button>
        </form>
        <p className="fine-print">13歳以上向け。登録すると利用ルールとプライバシー方針に同意したものとみなされます。</p>
      </section>
    </main>
  )
}
