import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from './lib/firebase'
import type { UserProfile } from './lib/models'
import { AuthScreen } from './components/AuthScreen'
import { Dashboard } from './components/Dashboard'
import { Onboarding } from './components/Onboarding'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [profileReady, setProfileReady] = useState(false)

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setUser(nextUser)
    setProfile(null)
    setAuthReady(true)
    setProfileReady(!nextUser)
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

  if (!authReady || !profileReady) {
    return <div className="loading-screen"><div className="brand-mark brand-mark--pulse"><span /></div><p>HIMAWA</p></div>
  }
  if (!user) return <AuthScreen />
  if (!profile) return <Onboarding user={user} />
  return <Dashboard user={user} profile={profile} />
}
