import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { onAuthStateChanged, reload, signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from './lib/firebase'
import type { UserProfile } from './lib/models'
import type { ModerationState } from './lib/models'
import { AdminDashboard } from './components/AdminDashboard'
import { AuthScreen } from './components/AuthScreen'
import { Dashboard } from './components/Dashboard'
import { Onboarding } from './components/Onboarding'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [profileReady, setProfileReady] = useState(false)
  const [accessReady, setAccessReady] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [moderation, setModeration] = useState<ModerationState | null>(null)
  const [route, setRoute] = useState(window.location.hash)

  useEffect(() => {
    const updateRoute = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', updateRoute)
    return () => window.removeEventListener('hashchange', updateRoute)
  }, [])

  useEffect(() => onAuthStateChanged(auth, async (nextUser) => {
    if (nextUser) await reload(nextUser).catch(() => undefined)
    setUser(nextUser)
    setProfile(null)
    setIsAdmin(false)
    setModeration(null)
    setAuthReady(true)
    setProfileReady(!nextUser)
    setAccessReady(!nextUser)
  }), [])

  useEffect(() => {
    if (!user) return
    setProfileReady(false)
    return onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => {
        setProfile(snapshot.exists() ? snapshot.data() as UserProfile : null)
        setProfileReady(true)
      },
      () => setProfileReady(true),
    )
  }, [user])

  useEffect(() => {
    if (!user) return
    setAccessReady(false)
    let adminReady = false
    let moderationReady = false
    const finish = () => adminReady && moderationReady && setAccessReady(true)
    const stopAdmin = onSnapshot(doc(db, 'admins', user.uid), (snapshot) => {
      setIsAdmin(snapshot.exists())
      adminReady = true
      finish()
    }, () => { setIsAdmin(false); adminReady = true; finish() })
    const stopModeration = onSnapshot(doc(db, 'moderation', user.uid), (snapshot) => {
      setModeration(snapshot.exists() ? snapshot.data() as ModerationState : null)
      moderationReady = true
      finish()
    }, () => { setModeration(null); moderationReady = true; finish() })
    return () => { stopAdmin(); stopModeration() }
  }, [user])

  if (!authReady || !profileReady || !accessReady) {
    return <div className="loading-screen"><div className="brand-mark brand-mark--pulse"><span /></div><p>HIMAWA</p></div>
  }
  if (!user) return <AuthScreen />
  if (moderation?.status === 'suspended') return <main className="access-page"><div className="brand-mark"><span /></div><p className="section-kicker">ACCOUNT PAUSED</p><h1>このアカウントは<br />一時停止されています</h1><p>{moderation.reason || '安全確認のため、現在HIMAWAを利用できません。'}</p><button className="primary-button" onClick={() => signOut(auth)}>ログアウト</button></main>
  if (!profile) return <Onboarding user={user} />
  if (route === '#admin' || route === '#/admin') {
    return isAdmin ? <AdminDashboard user={user} profile={profile} /> : <main className="access-page"><div className="brand-mark"><span /></div><p className="section-kicker">ADMIN ONLY</p><h1>管理画面には<br />アクセスできません</h1><p>この画面は登録された管理者だけが利用できます。</p><button className="primary-button" onClick={() => { window.location.hash = ''; window.location.reload() }}>アプリへ戻る</button></main>
  }
  return <Dashboard user={user} profile={profile} isAdmin={isAdmin} />
}
