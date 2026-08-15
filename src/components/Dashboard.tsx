import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { User } from 'firebase/auth'
import {
  deleteUser,
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  reload,
  signOut as firebaseSignOut,
  updatePassword,
  verifyBeforeUpdateEmail,
} from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import {
  Bell,
  AtSign,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Copy,
  Home,
  KeyRound,
  LogOut,
  MessageCircle,
  Music2,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Share2,
  UserRound,
  UserMinus,
  UsersRound,
  X,
} from 'lucide-react'
import { auth, db } from '../lib/firebase'
import { getAuthMethodEmails } from '../lib/authMethods'
import { currentPushState, disablePushNotifications, enablePushNotifications, sendPushEvent, type PushState } from '../lib/pushNotifications'
import type {
  ActivityKind,
  AvatarConfig,
  Conversation,
  DirectMessage,
  FriendEntry,
  FriendRequest,
  Group,
  GroupStatus,
  MusicAttachment,
  Note,
  Poke,
  PokeKind,
  PublicProfile,
  StatusShare,
  UserProfile,
} from '../lib/models'
import {
  ACTIVITY_OPTIONS,
  activityOption,
  availabilityOption,
  createAvailabilityStatus,
  getAvailability,
  getRemainingLabel,
  normalizeStatus,
  pokeLabel,
} from '../lib/status'
import { Avatar } from './Avatar'
import { AvatarEditor } from './AvatarEditor'
import { FriendStatusCard, type FriendStatusView } from './FriendStatusCard'
import { MusicPreviewPlayer } from './MusicPreviewPlayer'
import { StatusComposer } from './StatusComposer'

type Tab = 'home' | 'friends' | 'square' | 'dm' | 'groups' | 'settings'
type ModalKind = 'status' | 'invite' | 'poke' | 'notifications' | 'music' | 'avatar' | null
type FriendView = FriendStatusView

function timeOf(value?: { toMillis?: () => number }) {
  return value?.toMillis?.() ?? 0
}

function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const sheetRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onCloseRef.current()
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    sheetRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={sheetRef} tabIndex={-1} className="modal-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-handle" />
        <header><h2>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="閉じる"><X size={20} /></button></header>
        {children}
      </section>
    </div>
  )
}

export function NotificationPermissionPrompt({ busy, onAnswer }: { busy: boolean; onAnswer: (allow: boolean) => void }) {
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  return <div className="push-prompt-backdrop" role="presentation">
    <section ref={dialogRef} tabIndex={-1} className="push-permission-prompt" role="alertdialog" aria-modal="true" aria-labelledby="push-prompt-title" aria-describedby="push-prompt-description">
      <div className="push-permission-prompt__icon" aria-hidden="true">🔔</div>
      <h2 id="push-prompt-title">HIMAWAは通知を送信します。<br />よろしいですか？</h2>
      <p id="push-prompt-description">DM・誘い・友達申請が届いたときにお知らせします。通知は、端末のロック画面などに表示されることがあります。</p>
      <p className="push-permission-prompt__settings">通知はあとから「自分」→「通知」で変更できます。</p>
      <div className="push-permission-prompt__actions">
        <button type="button" onClick={() => onAnswer(false)} disabled={busy}>許可しない</button>
        <button type="button" className="is-primary" onClick={() => onAnswer(true)} disabled={busy}>{busy ? '設定中…' : '許可'}</button>
      </div>
    </section>
  </div>
}

function Empty({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return <div className="social-empty"><span>{emoji}</span><h3>{title}</h3><p>{body}</p></div>
}

function accountErrorMessage(code?: string) {
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') return '現在のパスワードが違います。'
  if (code === 'auth/requires-recent-login') return '安全のため、いったんログアウトしてログインし直してから試してください。'
  if (code === 'auth/email-already-in-use') return 'このメールアドレスは別のアカウントで使われています。'
  if (code === 'auth/invalid-email') return 'メールアドレスを確認してください。'
  if (code === 'auth/weak-password') return '新しいパスワードをもう少し長くしてください。'
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Googleの確認画面を閉じました。'
  if (code === 'auth/popup-blocked') return 'Googleの確認画面を開けませんでした。ポップアップを許可してください。'
  if (code === 'auth/credential-already-in-use') return 'このGoogleアカウントは別のHIMAWAアカウントで使われています。'
  if (code === 'auth/provider-already-linked') return 'Googleアカウントはすでに連携済みです。'
  return '変更できませんでした。通信状態を確認して、もう一度試してください。'
}

function AccountSettings({ user, onNotice }: { user: User; onNotice: (message: string) => void }) {
  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busyAction, setBusyAction] = useState<'email' | 'password' | 'google' | null>(null)
  const [methodEmails, setMethodEmails] = useState(() => getAuthMethodEmails(user.providerData))
  const hasPassword = Boolean(methodEmails.passwordEmail)
  const hasGoogle = Boolean(methodEmails.googleEmail)

  async function refreshMethods() {
    await reload(user)
    setMethodEmails(getAuthMethodEmails(user.providerData))
  }

  useEffect(() => {
    refreshMethods().catch(() => undefined)
    const refreshOnFocus = () => refreshMethods().catch(() => undefined)
    window.addEventListener('focus', refreshOnFocus)
    return () => window.removeEventListener('focus', refreshOnFocus)
  }, [user])

  async function reauthenticate(password: string) {
    if (hasPassword && methodEmails.passwordEmail && password) {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(methodEmails.passwordEmail, password))
      return
    }
    if (hasGoogle) {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await reauthenticateWithPopup(user, provider)
      return
    }
    if (hasPassword) throw Object.assign(new Error('Password required'), { code: 'auth/wrong-password' })
    throw new Error('No authentication provider')
  }

  function showError(reason: unknown) {
    const code = typeof reason === 'object' && reason && 'code' in reason ? String(reason.code) : undefined
    setError(accountErrorMessage(code))
  }

  async function changeEmail(event: FormEvent) {
    event.preventDefault()
    setError('')
    const nextEmail = newEmail.trim()
    if (!hasPassword) {
      setError('先にパスワードを追加すると、メール用のログインアドレスを設定できます。')
      return
    }
    if (!nextEmail || nextEmail === methodEmails.passwordEmail) {
      setError(nextEmail === methodEmails.passwordEmail ? '現在と違うメールアドレスを入力してください。' : '新しいメールアドレスを入力してください。')
      return
    }
    setBusyAction('email')
    try {
      await reauthenticate(emailPassword)
      auth.languageCode = 'ja'
      await verifyBeforeUpdateEmail(user, nextEmail, { url: `${window.location.origin}${window.location.pathname}` })
      setNewEmail('')
      setEmailPassword('')
      onNotice('新しいメールアドレスに確認メールを送りました。メール内のリンクを開くと変更されます。')
    } catch (reason) {
      showError(reason)
    } finally {
      setBusyAction(null)
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (newPassword.length < 8) {
      setError('新しいパスワードは8文字以上にしてください。')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('新しいパスワードが一致していません。')
      return
    }
    setBusyAction('password')
    try {
      await reauthenticate(currentPassword)
      if (hasPassword) {
        await updatePassword(user, newPassword)
        onNotice('パスワードを変更しました。')
      } else {
        if (!user.email) throw new Error('Email is required')
        await linkWithCredential(user, EmailAuthProvider.credential(user.email, newPassword))
        await refreshMethods()
        onNotice('メールアドレスとパスワードでもログインできるようになりました。')
      }
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (reason) {
      showError(reason)
    } finally {
      setBusyAction(null)
    }
  }

  async function connectGoogle() {
    setError('')
    setBusyAction('google')
    try {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await linkWithPopup(user, provider)
      await refreshMethods()
      onNotice('Googleアカウントを連携しました。次回からGoogleでもログインできます。')
    } catch (reason) {
      showError(reason)
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <section className="account-settings-card">
      <div className="account-settings-heading">
        <div className="settings-icon"><AtSign size={20} /></div>
        <div><h3>ログイン方法</h3><p>ログイン方法ごとに、使うメールアドレスを確認できます。</p></div>
      </div>
      <div className="sign-in-method-list">
        {hasPassword && <div className="sign-in-method-row"><span className="method-badge">メール</span><div><span>メール＋パスワードでログイン</span><strong>{methodEmails.passwordEmail}</strong></div></div>}
        {hasGoogle && <div className="sign-in-method-row"><span className="method-badge method-badge--google">G</span><div><span>Googleでログイン</span><strong>{methodEmails.googleEmail}</strong></div></div>}
      </div>
      {hasPassword && hasGoogle && methodEmails.passwordEmail !== methodEmails.googleEmail && <p className="account-method-hint">2つのメールアドレスは違いますが、どちらも同じHIMAWAアカウントにつながっています。メール＋パスワードで入るときは上の「メール」のアドレスを使ってください。</p>}

      {error && <p className="form-error account-form-error" role="alert">{error}</p>}

      {hasPassword ? <form className="account-change-form" onSubmit={changeEmail}>
        <div className="account-form-title"><AtSign size={17} /><strong>メールアドレスを変更</strong></div>
        <label>新しいメールアドレス<input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} autoComplete="email" placeholder="new@example.com" required /></label>
        {hasPassword && <label>現在のパスワード{hasGoogle ? '（空欄ならGoogleで本人確認）' : ''}<input type="password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} autoComplete="current-password" required={!hasGoogle} /></label>}
        <p className="account-form-note">新しいアドレスに確認メールを送ります。リンクを開くまで変更は完了しません。</p>
        <button className="account-submit-button" type="submit" disabled={busyAction !== null}>{busyAction === 'email' ? '送信中…' : '確認メールを送る'}</button>
      </form> : <div className="account-change-form account-change-form--info"><div className="account-form-title"><AtSign size={17} /><strong>メールアドレスでログインしたい場合</strong></div><p className="account-form-note">まず「パスワードを追加」してください。Googleのメールとは別に、メール＋パスワード用のログイン方法を作れます。</p></div>}

      <form className="account-change-form" onSubmit={changePassword}>
        <div className="account-form-title"><KeyRound size={17} /><strong>{hasPassword ? 'パスワードを変更' : 'パスワードを追加'}</strong></div>
        {hasPassword && <label>現在のパスワード{hasGoogle ? '（空欄ならGoogleで本人確認）' : ''}<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required={!hasGoogle} /></label>}
        <label>新しいパスワード<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} placeholder="8文字以上" required /></label>
        <label>新しいパスワード（確認）<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
        {!hasPassword && <p className="account-form-note">Googleで本人確認したあと、メールアドレスでもログインできるようにします。</p>}
        <button className="account-submit-button" type="submit" disabled={busyAction !== null}>{busyAction === 'password' ? '変更中…' : hasPassword ? 'パスワードを変更' : 'パスワードを追加'}</button>
      </form>

      {!hasGoogle && <div className="google-connect-row"><div><strong>Googleログイン</strong><p>連携すると、次回からGoogleでもログインできます。</p></div><button type="button" onClick={connectGoogle} disabled={busyAction !== null}><span className="google-glyph" aria-hidden="true">G</span>{busyAction === 'google' ? '連携中…' : '連携する'}</button></div>}
    </section>
  )
}

export function Dashboard({ user, profile, isAdmin = false }: { user: User; profile: UserProfile; isAdmin?: boolean }) {
  const [tab, setTab] = useState<Tab>('home')
  const [friends, setFriends] = useState<FriendView[]>([])
  const [friendIds, setFriendIds] = useState<string[]>([])
  const [friendsReady, setFriendsReady] = useState(false)
  const [friendsError, setFriendsError] = useState(false)
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [pokes, setPokes] = useState<Poke[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [following, setFollowing] = useState<Set<string>>(new Set())
  const [followerCount, setFollowerCount] = useState(0)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [dmError, setDmError] = useState(false)
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [selectedMusic, setSelectedMusic] = useState<MusicAttachment | null>(null)
  const [groupStatuses, setGroupStatuses] = useState<GroupStatus[]>([])
  const [modal, setModal] = useState<ModalKind>(null)
  const [pokeTarget, setPokeTarget] = useState<PublicProfile | null>(null)
  const [friendCode, setFriendCode] = useState('')
  const [noteText, setNoteText] = useState('')
  const [messageText, setMessageText] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [groupName, setGroupName] = useState('')
  const [groupCode, setGroupCode] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [pushState, setPushState] = useState<PushState>('loading')
  const [showPushPrompt, setShowPushPrompt] = useState(false)
  const [pushPromptBusy, setPushPromptBusy] = useState(false)
  const [pendingConversationId, setPendingConversationId] = useState('')
  const [now, setNow] = useState(Date.now())
  const coreActionLock = useRef(false)
  const friendSubscriptions = useRef<Map<string, () => void>>(new Map())
  const profileCache = useRef<Map<string, PublicProfile>>(new Map())
  const statusCache = useRef<Map<string, StatusShare | null>>(new Map())
  const migratedProfileUid = useRef('')

  const ownStatus = normalizeStatus(profile.currentStatus, now)
  const unreadCount = useMemo(() => requests.length + pokes.filter((poke) => !poke.readAt).length, [pokes, requests])
  const sortedFriends = useMemo(() => [...friends].sort((a, b) => {
    const rank = { free: 0, maybe: 1, busy: 2 }
    const aStatus = normalizeStatus(a.status, now)
    const bStatus = normalizeStatus(b.status, now)
    const availabilityDifference = rank[getAvailability(aStatus)] - rank[getAvailability(bStatus)]
    if (availabilityDifference) return availabilityDifference
    return (bStatus?.updatedAt ?? 0) - (aStatus?.updatedAt ?? 0) || a.profile.displayName.localeCompare(b.profile.displayName, 'ja')
  }), [friends, now])
  const invitableCount = useMemo(() => sortedFriends.filter((friend) => {
    const status = normalizeStatus(friend.status, now)
    return status && getAvailability(status) !== 'busy'
  }).length, [now, sortedFriends])

  function refreshFriends() {
    setFriends(friendIds.map((uid) => {
      const friendProfile = profileCache.current.get(uid)
      return friendProfile ? { profile: friendProfile, status: statusCache.current.get(uid) ?? null } : null
    }).filter((item): item is FriendView => Boolean(item)).sort((a, b) => a.profile.displayName.localeCompare(b.profile.displayName, 'ja')))
  }

  useEffect(() => {
    if (migratedProfileUid.current === user.uid) return
    migratedProfileUid.current = user.uid
    const socialProfile: PublicProfile = { uid: user.uid, displayName: profile.displayName, avatar: profile.avatar, bio: profile.bio ?? '', discoverable: profile.discoverable ?? true }
    const batch = writeBatch(db)
    batch.set(doc(db, 'users', user.uid), { defaultStatusVisibility: 'friends', discoverable: profile.discoverable ?? true, bio: profile.bio ?? '' }, { merge: true })
    batch.set(doc(db, 'publicProfiles', user.uid), { ...socialProfile, updatedAt: serverTimestamp() }, { merge: true })
    if (normalizeStatus(profile.currentStatus) && profile.currentStatus?.visibility !== 'groups') {
      const migrated = { ...normalizeStatus(profile.currentStatus)!, visibility: 'friends' as const }
      batch.set(doc(db, 'users', user.uid), { currentStatus: migrated }, { merge: true })
      if (!profile.statusHidden) batch.set(doc(db, 'statusShares', user.uid), { ...migrated, uid: user.uid, displayName: profile.displayName, avatar: profile.avatar })
    }
    batch.commit().catch(() => undefined)
  }, [profile.avatar, profile.bio, profile.currentStatus, profile.defaultStatusVisibility, profile.discoverable, profile.displayName, user.uid])

  useEffect(() => onSnapshot(collection(db, 'users', user.uid, 'friends'), (snapshot) => {
    setFriendIds(snapshot.docs.map((item) => (item.data() as FriendEntry).uid))
    setFriendsReady(true)
    setFriendsError(false)
  }, () => {
    setFriendsReady(true)
    setFriendsError(true)
  }), [user.uid])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const inviteCode = params.get('invite')?.toUpperCase() ?? ''
    if (inviteCode.length === 6) {
      setFriendCode(inviteCode)
      setModal('invite')
    }
    if (params.get('open') === 'notifications') setModal('notifications')
    if (params.get('open') === 'dm') {
      setTab('dm')
      setPendingConversationId(params.get('conversation') ?? '')
    }
  }, [])

  useEffect(() => { currentPushState().then(setPushState).catch(() => setPushState('unsupported')) }, [])

  useEffect(() => {
    if (profile.pushPromptShownAt || pushState !== 'default' || modal || showPushPrompt) return
    const timer = window.setTimeout(() => setShowPushPrompt(true), 700)
    return () => window.clearTimeout(timer)
  }, [modal, profile.pushPromptShownAt, pushState, showPushPrompt])

  useEffect(() => {
    if (!pendingConversationId) return
    const conversation = conversations.find((item) => item.id === pendingConversationId)
    if (!conversation) return
    setSelectedConversation(conversation)
    setPendingConversationId('')
    const url = new URL(window.location.href)
    url.searchParams.delete('open')
    url.searchParams.delete('conversation')
    window.history.replaceState({}, '', url)
  }, [conversations, pendingConversationId])

  useEffect(() => {
    if (!profile.currentStatus || profile.currentStatus.expiresAt > now) return
    const batch = writeBatch(db)
    batch.set(doc(db, 'users', user.uid), { currentStatus: null }, { merge: true })
    batch.delete(doc(db, 'statusShares', user.uid))
    groups.forEach((group) => batch.delete(doc(db, 'groups', group.id, 'statuses', user.uid)))
    batch.commit().catch(() => undefined)
  }, [groups, now, profile.currentStatus, user.uid])

  useEffect(() => {
    const expected = new Set(friendIds)
    friendSubscriptions.current.forEach((stop, key) => {
      const uid = key.split(':')[1]
      if (!expected.has(uid)) { stop(); friendSubscriptions.current.delete(key); profileCache.current.delete(uid); statusCache.current.delete(uid) }
    })
    friendIds.forEach((uid) => {
      const profileKey = `profile:${uid}`
      if (!friendSubscriptions.current.has(profileKey)) {
        const stop = onSnapshot(doc(db, 'publicProfiles', uid), async (snapshot) => {
          if (snapshot.exists()) profileCache.current.set(uid, snapshot.data() as PublicProfile)
          else {
            const legacy = await getDoc(doc(db, 'users', uid)).catch(() => null)
            if (legacy?.exists()) {
              const item = legacy.data() as UserProfile
              profileCache.current.set(uid, { uid, displayName: item.displayName, avatar: item.avatar, bio: item.bio ?? '', discoverable: true })
            }
          }
          refreshFriends()
        })
        friendSubscriptions.current.set(profileKey, stop)
      }
      const statusKey = `status:${uid}`
      if (!friendSubscriptions.current.has(statusKey)) {
        const stop = onSnapshot(doc(db, 'statusShares', uid), (snapshot) => { statusCache.current.set(uid, snapshot.exists() ? snapshot.data() as StatusShare : null); refreshFriends() }, () => { statusCache.current.set(uid, null); refreshFriends() })
        friendSubscriptions.current.set(statusKey, stop)
      }
    })
    refreshFriends()
  }, [friendIds])

  useEffect(() => () => { friendSubscriptions.current.forEach((stop) => stop()); friendSubscriptions.current.clear() }, [])

  useEffect(() => onSnapshot(query(collection(db, 'friendRequests'), where('toUid', '==', user.uid)), (snapshot) => setRequests(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as FriendRequest).filter((item) => item.status === 'pending'))), [user.uid])
  useEffect(() => onSnapshot(query(collection(db, 'pokes'), where('toUid', '==', user.uid)), (snapshot) => setPokes(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Poke).sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt)).slice(0, 30))), [user.uid])
  useEffect(() => onSnapshot(collection(db, 'notes'), (snapshot) => setNotes(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Note).filter((item) => item.expiresAt > Date.now()).sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt)).slice(0, 80))), [])
  useEffect(() => onSnapshot(collection(db, 'users', user.uid, 'following'), (snapshot) => setFollowing(new Set(snapshot.docs.map((item) => item.id)))), [user.uid])
  useEffect(() => onSnapshot(collection(db, 'users', user.uid, 'followers'), (snapshot) => setFollowerCount(snapshot.size)), [user.uid])
  useEffect(() => {
    if (!friendIds.length) { setConversations([]); setDmError(false); return }
    const currentFriendIds = new Set(friendIds)
    return onSnapshot(query(collection(db, 'conversations'), where('participants', 'array-contains', user.uid)), (snapshot) => {
      setConversations(snapshot.docs
        .map((item) => ({ id: item.id, ...item.data(), lastMessage: item.data().lastMessage ?? '' }) as Conversation)
        .filter((conversation) => conversation.participants.some((uid) => uid !== user.uid && currentFriendIds.has(uid)))
        .sort((a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt)))
      setDmError(false)
    }, () => {
      setConversations([])
      setDmError(true)
    })
  }, [friendIds, user.uid])

  useEffect(() => onSnapshot(collection(db, 'users', user.uid, 'groups'), async (snapshot) => {
    const loaded = await Promise.all(snapshot.docs.map(async (item) => {
      const group = await getDoc(doc(db, 'groups', item.id)).catch(() => null)
      return group?.exists() ? { id: group.id, ...group.data() } as Group : null
    }))
    setGroups(loaded.filter((item): item is Group => Boolean(item)))
  }), [user.uid])

  useEffect(() => {
    if (!selectedConversation) { setMessages([]); return }
    return onSnapshot(collection(db, 'conversations', selectedConversation.id, 'messages'), (snapshot) => {
      setMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as DirectMessage).sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt)))
      setDmError(false)
    }, () => {
      setMessages([])
      setDmError(true)
    })
  }, [selectedConversation])

  useEffect(() => {
    if (!selectedGroup) { setGroupStatuses([]); return }
    return onSnapshot(collection(db, 'groups', selectedGroup.id, 'statuses'), (snapshot) => setGroupStatuses(snapshot.docs.map((item) => item.data() as GroupStatus).filter((item) => item.expiresAt > Date.now()).sort((a, b) => b.updatedAt - a.updatedAt)))
  }, [selectedGroup])

  async function saveStatus(value: { availability: 'free' | 'maybe' | 'busy'; activities: ActivityKind[]; note: string; visibility: 'friends' | 'groups'; expiresAt: number; groupIds: string[]; music?: MusicAttachment }) {
    if (coreActionLock.current) return
    coreActionLock.current = true
    setBusy(true)
    try {
      const baseStatus = createAvailabilityStatus(value.availability, value.activities, value.note, value.visibility, value.expiresAt, value.groupIds)
      const status = { ...baseStatus, ...(value.music ? { music: value.music } : {}) }
      const batch = writeBatch(db)
      batch.set(doc(db, 'users', user.uid), { currentStatus: status, statusHidden: false, ...(value.visibility !== 'groups' ? { defaultStatusVisibility: 'friends' } : {}) }, { merge: true })
      groups.forEach((group) => batch.delete(doc(db, 'groups', group.id, 'statuses', user.uid)))
      if (value.visibility === 'groups') {
        batch.delete(doc(db, 'statusShares', user.uid))
        value.groupIds.forEach((groupId) => batch.set(doc(db, 'groups', groupId, 'statuses', user.uid), { ...status, uid: user.uid, displayName: profile.displayName, avatar: profile.avatar }))
      } else {
        batch.set(doc(db, 'statusShares', user.uid), { ...status, uid: user.uid, displayName: profile.displayName, avatar: profile.avatar })
      }
      await batch.commit()
      setModal(null)
      setNotice(value.availability === 'free' ? 'ひまになりました 🌻' : value.availability === 'maybe' ? '誘われたら行ける、にしました' : '今は無理、にしました')
    } catch { setNotice('状態を更新できませんでした。もう一度試してね') } finally { setBusy(false); coreActionLock.current = false }
  }

  async function saveAvatar(avatar: AvatarConfig) {
    if (busy) return
    setBusy(true)
    try {
      const statusRef = doc(db, 'statusShares', user.uid)
      const publicProfileRef = doc(db, 'publicProfiles', user.uid)
      const groupStatusRefs = groups.map((group) => doc(db, 'groups', group.id, 'statuses', user.uid))
      const [statusSnapshot, publicProfileSnapshot, ...groupStatusSnapshots] = await Promise.all([
        getDoc(statusRef),
        getDoc(publicProfileRef),
        ...groupStatusRefs.map((reference) => getDoc(reference)),
      ])
      const batch = writeBatch(db)
      batch.update(doc(db, 'users', user.uid), { avatar })
      if (publicProfileSnapshot.exists()) batch.update(publicProfileRef, { avatar, updatedAt: serverTimestamp() })
      else batch.set(publicProfileRef, { uid: user.uid, displayName: profile.displayName, avatar, bio: profile.bio ?? '', discoverable: profile.discoverable ?? true, updatedAt: serverTimestamp() })
      if (statusSnapshot.exists()) batch.update(statusRef, { avatar })
      groupStatusSnapshots.forEach((snapshot, index) => {
        if (snapshot.exists()) batch.update(groupStatusRefs[index], { avatar })
      })
      await batch.commit()
      setModal(null)
      setNotice('アイコンを変更しました 🌻')
    } catch {
      setNotice('アイコンを保存できませんでした。もう一度試してね')
    } finally {
      setBusy(false)
    }
  }

  async function quickSetFree() {
    if (busy) return
    await saveStatus({ availability: 'free', activities: [], note: '', visibility: 'friends', expiresAt: Date.now() + 60 * 60_000, groupIds: [] })
  }

  async function sendRequest() {
    const code = friendCode.trim().toUpperCase()
    if (code.length !== 6) { setNotice('6文字の友達コードを入力してください'); return }
    setBusy(true)
    try {
      const codeSnapshot = await getDoc(doc(db, 'codes', code))
      if (!codeSnapshot.exists()) throw new Error('NOT_FOUND')
      const target = codeSnapshot.data() as { uid: string; displayName: string }
      if (target.uid === user.uid) throw new Error('SELF')
      if (friendIds.includes(target.uid)) throw new Error('ALREADY')
      const requestId = `${user.uid}_${target.uid}`
      await setDoc(doc(db, 'friendRequests', requestId), { fromUid: user.uid, fromName: profile.displayName, fromAvatar: profile.avatar, toUid: target.uid, status: 'pending', createdAt: serverTimestamp() })
      void sendPushEvent(user, { type: 'friend_request', requestId, targetUid: target.uid })
      setFriendCode(''); setModal(null); setNotice(`${target.displayName}さんに申請しました`)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : ''
      setNotice(message === 'SELF' ? '自分のコードです' : message === 'ALREADY' ? 'すでに友達です' : 'コードが見つかりませんでした')
    } finally { setBusy(false) }
  }

  async function respondToRequest(request: FriendRequest, accept: boolean) {
    setBusy(true)
    try {
      if (!accept) await updateDoc(doc(db, 'friendRequests', request.id), { status: 'declined', respondedAt: serverTimestamp() })
      else {
        const batch = writeBatch(db)
        batch.update(doc(db, 'friendRequests', request.id), { status: 'accepted', respondedAt: serverTimestamp() })
        batch.set(doc(db, 'users', user.uid, 'friends', request.fromUid), { uid: request.fromUid, requestId: request.id, createdAt: serverTimestamp() })
        batch.set(doc(db, 'users', request.fromUid, 'friends', user.uid), { uid: user.uid, requestId: request.id, createdAt: serverTimestamp() })
        await batch.commit()
        await ensureConversation({ uid: request.fromUid, displayName: request.fromName, avatar: request.fromAvatar, bio: '', discoverable: true }).catch(() => undefined)
      }
      setNotice(accept ? `${request.fromName}さんと友達になりました` : '申請を断りました')
    } catch { setNotice('申請を更新できませんでした') } finally { setBusy(false) }
  }

  async function sendInvite(target: PublicProfile, activity?: ActivityKind, customMessage?: string) {
    if (coreActionLock.current) return
    coreActionLock.current = true
    setBusy(true)
    try {
      const activityMeta = activityOption(activity)
      const kind: PokeKind = activityMeta?.pokeKind ?? 'play'
      const message = customMessage?.trim() || activityMeta?.inviteLabel || '遊ぼう'
      const pokeRef = await addDoc(collection(db, 'pokes'), {
        fromUid: user.uid,
        fromName: profile.displayName,
        toUid: target.uid,
        kind,
        ...(activity ? { activity } : {}),
        message,
        readAt: null,
        createdAt: serverTimestamp(),
      })
      void sendPushEvent(user, { type: 'invite', pokeId: pokeRef.id, targetUid: target.uid })
      setInviteMessage('')
      setModal(null)
      setNotice(`${target.displayName}さんを「${message}」に誘いました 🌻`)
    } catch { setNotice('誘いを送れませんでした。もう一度試してね') } finally { setBusy(false); coreActionLock.current = false }
  }

  async function postNote(event: FormEvent) {
    event.preventDefault()
    if (!noteText.trim()) return
    setBusy(true)
    try {
      await addDoc(collection(db, 'notes'), { authorUid: user.uid, authorName: profile.displayName, authorAvatar: profile.avatar, text: noteText.trim(), expiresAt: Date.now() + 24 * 60 * 60_000, createdAt: serverTimestamp() })
      setNoteText(''); setNotice('広場に放しました。24時間で消えます')
    } catch { setNotice('投稿できませんでした') } finally { setBusy(false) }
  }

  async function toggleFollow(targetUid: string) {
    const batch = writeBatch(db)
    if (following.has(targetUid)) {
      batch.delete(doc(db, 'users', user.uid, 'following', targetUid)); batch.delete(doc(db, 'users', targetUid, 'followers', user.uid))
    } else {
      batch.set(doc(db, 'users', user.uid, 'following', targetUid), { uid: targetUid, createdAt: serverTimestamp() }); batch.set(doc(db, 'users', targetUid, 'followers', user.uid), { uid: user.uid, createdAt: serverTimestamp() })
    }
    await batch.commit().catch(() => setNotice('フォローを更新できませんでした'))
  }

  async function ensureConversation(friend: PublicProfile) {
    const id = [user.uid, friend.uid].sort().join('_')
    const conversationRef = doc(db, 'conversations', id)
    const participants = [user.uid, friend.uid].sort()
    try {
      const snapshot = await getDoc(conversationRef)
      if (snapshot.exists()) {
        const stored = snapshot.data() as Omit<Conversation, 'id'>
        if (!stored.participants.includes(friend.uid) || !stored.participants.includes(user.uid)) throw new Error('INVALID_CONVERSATION')
        return { ...stored, id, lastMessage: stored.lastMessage ?? '' } as Conversation
      }
    } catch (reason) {
      if (reason instanceof Error && reason.message === 'INVALID_CONVERSATION') throw reason
      // Firestore denies get on a document that does not exist because the
      // participant fields cannot be checked yet. Creating it is allowed once
      // the mutual friendship documents exist.
    }
    const conversation: Conversation = {
      id,
      participants,
      participantNames: { [user.uid]: profile.displayName, [friend.uid]: friend.displayName },
      participantAvatars: { [user.uid]: profile.avatar, [friend.uid]: friend.avatar },
      lastMessage: '',
    }
    await setDoc(conversationRef, { ...conversation, updatedAt: serverTimestamp() })
    return conversation
  }

  async function openConversation(friend: PublicProfile) {
    if (busy) return
    setBusy(true)
    try {
      const conversation = await ensureConversation(friend)
      setSelectedConversation(conversation)
      setDmError(false)
      setTab('dm')
    } catch {
      setNotice('トークを開けませんでした。通信を確認してもう一度試してね')
      setDmError(true)
    } finally { setBusy(false) }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault()
    if (!selectedConversation || !messageText.trim() || busy) return
    const text = messageText.trim(); setMessageText('')
    setBusy(true)
    const targetUid = selectedConversation.participants.find((uid) => uid !== user.uid)
    const messageRef = doc(collection(db, 'conversations', selectedConversation.id, 'messages'))
    const batch = writeBatch(db)
    batch.set(messageRef, { senderUid: user.uid, text, createdAt: serverTimestamp() })
    batch.set(doc(db, 'conversations', selectedConversation.id), { lastMessage: text, updatedAt: serverTimestamp() }, { merge: true })
    await batch.commit()
      .then(() => {
        setDmError(false)
        if (targetUid) void sendPushEvent(user, { type: 'dm', conversationId: selectedConversation.id, messageId: messageRef.id, targetUid })
      })
      .catch(() => { setMessageText(text); setDmError(true); setNotice('メッセージを送れませんでした。友達状態と通信を確認してね') })
      .finally(() => setBusy(false))
  }

  async function togglePushNotifications() {
    if (pushState === 'loading' || pushState === 'unconfigured' || pushState === 'unsupported') return
    const wasEnabled = pushState === 'granted'
    setPushState('loading')
    try {
      if (wasEnabled) {
        await disablePushNotifications(user)
        setPushState('default')
        setNotice('端末への通知をオフにしました')
      } else {
        await enablePushNotifications(user)
        setPushState('granted')
        setNotice('端末への通知をオンにしました 🔔')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      const nextState: PushState = await currentPushState().catch((): PushState => 'unsupported')
      setPushState(nextState)
      setNotice(message === 'PUSH_DENIED' ? '端末の設定でHIMAWAの通知を許可してください' : '通知を設定できませんでした。もう一度試してね')
    }
  }

  async function answerPushPrompt(allow: boolean) {
    if (pushPromptBusy) return
    setPushPromptBusy(true)
    if (allow) setPushState('loading')
    const permissionTask = allow
      ? enablePushNotifications(user).then(() => ({ ok: true as const }), (error: unknown) => ({ ok: false as const, error }))
      : null
    setShowPushPrompt(false)
    try {
      await setDoc(doc(db, 'users', user.uid), { pushPromptShownAt: serverTimestamp() }, { merge: true })
      if (permissionTask) {
        const result = await permissionTask
        if (result.ok) {
          setPushState('granted')
          setNotice('端末への通知をオンにしました 🔔')
        } else {
          const message = result.error instanceof Error ? result.error.message : ''
          setPushState(await currentPushState().catch((): PushState => 'unsupported'))
          setNotice(message === 'PUSH_DENIED' ? '端末の設定でHIMAWAの通知を許可してください' : '通知を設定できませんでした。設定からもう一度試してね')
        }
      }
    } catch {
      if (permissionTask) await permissionTask
      setPushState(await currentPushState().catch((): PushState => 'unsupported'))
      setNotice('通知の選択を保存できませんでした。もう一度試してね')
    } finally {
      setPushPromptBusy(false)
    }
  }

  async function createGroup(event: FormEvent) {
    event.preventDefault(); const name = groupName.trim()
    if (name.length < 2) return
    setBusy(true)
    try {
      const groupRef = doc(collection(db, 'groups')); const inviteCode = randomCode(); const batch = writeBatch(db)
      batch.set(groupRef, { name, ownerUid: user.uid, inviteCode, createdAt: serverTimestamp() })
      batch.set(doc(db, 'groupCodes', inviteCode), { groupId: groupRef.id, ownerUid: user.uid })
      batch.set(doc(db, 'groups', groupRef.id, 'members', user.uid), { uid: user.uid, displayName: profile.displayName, avatar: profile.avatar, joinedAt: serverTimestamp() })
      batch.set(doc(db, 'users', user.uid, 'groups', groupRef.id), { groupId: groupRef.id, joinedAt: serverTimestamp() })
      await batch.commit(); setGroupName(''); setNotice(`「${name}」を作りました`)
    } catch { setNotice('グループを作れませんでした') } finally { setBusy(false) }
  }

  async function joinGroup(event: FormEvent) {
    event.preventDefault(); const code = groupCode.trim().toUpperCase()
    setBusy(true)
    try {
      const codeSnapshot = await getDoc(doc(db, 'groupCodes', code)); if (!codeSnapshot.exists()) throw new Error()
      const { groupId } = codeSnapshot.data() as { groupId: string }; const batch = writeBatch(db)
      batch.set(doc(db, 'groups', groupId, 'members', user.uid), { uid: user.uid, displayName: profile.displayName, avatar: profile.avatar, joinedAt: serverTimestamp() })
      batch.set(doc(db, 'users', user.uid, 'groups', groupId), { groupId, joinedAt: serverTimestamp() })
      await batch.commit(); setGroupCode(''); setNotice('グループに参加しました')
    } catch { setNotice('招待コードが見つかりませんでした') } finally { setBusy(false) }
  }

  async function updatePrivacy(field: 'discoverable' | 'defaultStatusVisibility', value: boolean | string) {
    const batch = writeBatch(db); batch.set(doc(db, 'users', user.uid), { [field]: value }, { merge: true })
    if (field === 'discoverable') batch.set(doc(db, 'publicProfiles', user.uid), { discoverable: value, updatedAt: serverTimestamp() }, { merge: true })
    await batch.commit().then(() => setNotice('公開設定を更新しました')).catch(() => setNotice('設定を更新できませんでした'))
  }

  async function setGhostMode(hidden: boolean) {
    const status = normalizeStatus(profile.currentStatus)
    const batch = writeBatch(db)
    batch.set(doc(db, 'users', user.uid), { statusHidden: hidden }, { merge: true })
    batch.delete(doc(db, 'statusShares', user.uid))
    groups.forEach((group) => batch.delete(doc(db, 'groups', group.id, 'statuses', user.uid)))
    if (!hidden && status) {
      if (status.visibility === 'groups') {
        status.groupIds?.forEach((groupId) => batch.set(doc(db, 'groups', groupId, 'statuses', user.uid), { ...status, uid: user.uid, displayName: profile.displayName, avatar: profile.avatar }))
      } else {
        batch.set(doc(db, 'statusShares', user.uid), { ...status, visibility: 'friends', uid: user.uid, displayName: profile.displayName, avatar: profile.avatar })
      }
    }
    await batch.commit().then(() => setNotice(hidden ? '友達から状態を隠しました' : '状態の共有を再開しました')).catch(() => setNotice('非表示設定を更新できませんでした'))
  }

  async function copyCode(value = profile.friendCode) { await navigator.clipboard.writeText(value); setNotice('コードをコピーしました') }

  async function shareInvite() {
    const url = new URL(window.location.href)
    url.search = ''
    url.hash = ''
    url.searchParams.set('invite', profile.friendCode)
    const shareData = { title: 'HIMAWAで友達になろう', text: `${profile.displayName}さんからHIMAWAの招待が届きました 🌻`, url: url.toString() }
    if (navigator.share) await navigator.share(shareData).catch(() => undefined)
    else await navigator.clipboard.writeText(url.toString()).then(() => setNotice('招待リンクをコピーしました'))
  }

  async function removeFriend(friend: PublicProfile, block = false) {
    if (!window.confirm(`${friend.displayName}さんを${block ? 'ブロック' : '友達から削除'}しますか？`)) return
    const batch = writeBatch(db); batch.delete(doc(db, 'users', user.uid, 'friends', friend.uid)); batch.delete(doc(db, 'users', friend.uid, 'friends', user.uid))
    if (block) batch.set(doc(db, 'users', user.uid, 'blocks', friend.uid), { uid: friend.uid, createdAt: serverTimestamp() })
    await batch.commit(); setNotice(block ? 'ブロックしました' : '友達から削除しました')
  }

  async function deleteAccount() {
    if (!window.confirm('アカウントを削除します。この操作は取り消せません。')) return
    try { await disablePushNotifications(user); await deleteDoc(doc(db, 'codes', profile.friendCode)); await deleteDoc(doc(db, 'publicProfiles', user.uid)); await deleteDoc(doc(db, 'users', user.uid)); await deleteUser(user) }
    catch { setNotice('再ログイン後にもう一度お試しください') }
  }

  async function signOut(instance = auth) {
    await disablePushNotifications(user).catch(() => undefined)
    await firebaseSignOut(instance)
  }

  const activeConversationFriend = selectedConversation ? (() => {
    const uid = selectedConversation.participants.find((id) => id !== user.uid) ?? ''
    const latest = friends.find((friend) => friend.profile.uid === uid)?.profile
    return {
      uid,
      name: latest?.displayName ?? selectedConversation.participantNames[uid] ?? '友達',
      avatar: latest?.avatar ?? selectedConversation.participantAvatars[uid],
    }
  })() : null

  const ownAvailability = getAvailability(ownStatus)
  const ownAvailabilityMeta = availabilityOption(ownAvailability)
  const ownActivities = ownStatus?.activities?.map((item) => activityOption(item)).filter((item): item is NonNullable<typeof item> => Boolean(item)) ?? []
  const inviteOptions = (() => {
    const targetStatus = pokeTarget ? normalizeStatus(friends.find((item) => item.profile.uid === pokeTarget.uid)?.status ?? null, now) : null
    const preferred = targetStatus?.activities ?? []
    return [...ACTIVITY_OPTIONS].sort((a, b) => {
      const aIndex = preferred.indexOf(a.value)
      const bIndex = preferred.indexOf(b.value)
      if (aIndex >= 0 && bIndex < 0) return -1
      if (aIndex < 0 && bIndex >= 0) return 1
      return aIndex - bIndex
    }).slice(0, 6)
  })()

  function renderFriendCard(friend: FriendView) {
    return <FriendStatusCard
      key={friend.profile.uid}
      friend={friend}
      now={now}
      onInvite={(activity) => sendInvite(friend.profile, activity)}
      onInviteOptions={() => { setPokeTarget(friend.profile); setModal('poke') }}
      onMessage={() => openConversation(friend.profile)}
      onMusic={(music) => { setSelectedMusic(music); setModal('music') }}
    />
  }

  return (
    <main className="app-shell">
      <header className="app-header"><div className="mini-brand"><span className="mini-brand__dot" /> HIMAWA</div><div className="header-actions"><button className="header-bell" onClick={() => setModal('notifications')} aria-label="お知らせ"><Bell size={19} />{unreadCount > 0 && <em>{unreadCount}</em>}</button><button className="header-avatar" onClick={() => setTab('settings')} aria-label="設定を開く"><Avatar config={profile.avatar} size="small" /></button></div></header>

      <div className="app-content">
        {tab === 'home' && <div className="home-dashboard">
          <section className="greeting-row">
            <div><p>ひま？が、見える。</p><h1>{profile.displayName}<span>さん</span></h1></div>
            <button className="add-friend-button" onClick={() => setModal('invite')}><Plus size={18} /> 友達追加</button>
          </section>

          <section className={`quick-status-card quick-status-card--${ownAvailability} ${profile.statusHidden ? 'is-hidden' : ''}`}>
            <div className="quick-status-card__summary">
              <Avatar config={profile.avatar} size="medium" />
              <div><p className="section-kicker">あなたの今</p><strong><span aria-hidden="true">{ownAvailabilityMeta.emoji}</span> {profile.statusHidden ? '状態を隠しています' : ownStatus ? ownAvailabilityMeta.label : '今は無理'}</strong>
                <small>{profile.statusHidden ? '友達には表示されません' : ownStatus ? `${getRemainingLabel(ownStatus, now)} · 友達だけ` : 'ひまになったら、すぐ知らせよう'}</small>
              </div>
            </div>
            {ownActivities.length > 0 && <div className="own-activity-list">{ownActivities.map((item) => <span key={item.value}>{item.emoji} {item.statusLabel}</span>)}</div>}
            {ownStatus?.music && <button className="own-music-chip" onClick={() => { setSelectedMusic(ownStatus.music!); setModal('music') }}><Music2 size={14} /><span><strong>{ownStatus.music.title}</strong>{ownStatus.music.artistName && <small>{ownStatus.music.artistName}</small>}</span></button>}
            <div className="quick-status-card__actions">
              <button className="hima-cta" onClick={ownStatus && ownAvailability === 'free' && !profile.statusHidden ? () => setModal('status') : quickSetFree} disabled={busy}>{busy ? '更新中…' : '🌻 ひま！'}</button>
              <button className="status-detail-button" onClick={() => setModal('status')}>くわしく設定 <ChevronRight size={16} /></button>
            </div>
          </section>

          <section className="friends-section">
            <div className="section-heading"><div><p className="section-kicker">FRIENDS NOW</p><h2>今、誘える友達</h2></div><span>{invitableCount}人</span></div>
            {friendsError ? <div className="inline-error" role="alert"><strong>友達の状態を読み込めませんでした</strong><p>通信を確認して、少し待ってから再読み込みしてください。</p></div>
              : !friendsReady || (friendIds.length > 0 && friends.length < friendIds.length) ? <div className="friend-skeleton-list" aria-label="友達を読み込み中">{[0, 1, 2].map((item) => <div className="friend-skeleton" key={item}><i /><div><span /><span /><span /></div></div>)}</div>
                : sortedFriends.length ? <div className="friend-status-list">{sortedFriends.map(renderFriendCard)}</div>
                  : <div className="friends-empty-state"><span aria-hidden="true">🌻</span><h3>友達を追加して、<br />今ひまな人を見つけよう</h3><p>友達コードか招待リンクで、知っている友達とだけつながれます。</p><div><button className="primary-button" onClick={() => setModal('invite')}><Plus size={17} /> 友達を追加</button><button className="secondary-button" onClick={shareInvite}><Share2 size={17} /> 招待リンク</button></div></div>}
          </section>
        </div>}

        {tab === 'friends' && <section className="page-section friends-page">
          <div className="page-title"><div><p className="section-kicker">FRIENDS</p><h1>友達</h1><p>今の状態を見て、気軽に声をかけよう。</p></div><button className="soft-button" onClick={() => setModal('invite')}><Plus size={17} /> 追加</button></div>
          {sortedFriends.length ? <div className="friend-status-list friends-page-list">{sortedFriends.map(renderFriendCard)}</div> : <div className="friends-empty-state"><span aria-hidden="true">🌱</span><h3>最初の友達とつながろう</h3><p>招待リンクを送るか、友達コードを入力すれば始められます。</p><div><button className="primary-button" onClick={() => setModal('invite')}>友達を追加</button><button className="secondary-button" onClick={shareInvite}><Share2 size={17} /> 招待リンク</button></div></div>}
          <h2 className="subheading">ほかのつながり方</h2>
          <div className="social-shortcuts"><button onClick={() => setTab('groups')}><UsersRound size={20} /><div><strong>グループ</strong><span>招待された仲間と共有</span></div><ChevronRight size={17} /></button><button onClick={() => setTab('square')}><Compass size={20} /><div><strong>広場</strong><span>24時間で消えるひとこと</span></div><ChevronRight size={17} /></button></div>
        </section>}

        {tab === 'square' && <section className="page-section social-page"><div className="page-title"><div><p className="section-kicker">SQUARE</p><h1>広場</h1><p>知り合う前の、軽いひとこと。写真も人気数もありません。</p></div><span className="live-chip">24hで消える</span></div><form className="note-composer" onSubmit={postNote}><Avatar config={profile.avatar} size="small" /><textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="みんなに聞いてみたいことは？" maxLength={160} /><footer><small>{noteText.length}/160</small><button disabled={busy || !noteText.trim()}><Send size={16} /> 放す</button></footer></form><div className="note-feed">{notes.length ? notes.map((note) => <article className="note-card" key={note.id}><Avatar config={note.authorAvatar} size="small" /><div><header><strong>{note.authorName}</strong><span>{Math.max(1, Math.ceil((note.expiresAt - Date.now()) / 3_600_000))}h</span></header><p>{note.text}</p>{note.authorUid !== user.uid && <button className={following.has(note.authorUid) ? 'is-following' : ''} onClick={() => toggleFollow(note.authorUid)}>{following.has(note.authorUid) ? 'フォロー中' : 'フォローする'}</button>}{note.authorUid === user.uid && <button className="delete-note" onClick={() => deleteDoc(doc(db, 'notes', note.id))}>削除</button>}</div></article>) : <Empty emoji="🫧" title="まだ静かな広場です" body="最初のひとことを放してみよう。" />}</div></section>}

        {tab === 'dm' && <section className="page-section dm-page"><div className="page-title"><div><p className="section-kicker">MESSAGES</p><h1>DM</h1><p>DMできるのは、お互いに友達の人だけです。</p></div></div>{dmError && <div className="inline-error dm-inline-error" role="alert"><strong>DMを読み込めませんでした</strong><p>通信を確認して、友達のカードからもう一度トークを開いてください。</p></div>}<div className={`dm-layout ${selectedConversation ? 'has-chat' : ''}`}><aside className="conversation-list"><h2>トーク</h2>{conversations.map((conversation) => { const otherUid = conversation.participants.find((id) => id !== user.uid) ?? ''; const latest = friends.find((friend) => friend.profile.uid === otherUid)?.profile; return <button key={conversation.id} className={selectedConversation?.id === conversation.id ? 'is-active' : ''} onClick={() => { setSelectedConversation(conversation); setDmError(false) }}><Avatar config={latest?.avatar ?? conversation.participantAvatars[otherUid]} size="small" /><div><strong>{latest?.displayName ?? conversation.participantNames[otherUid]}</strong><span>{conversation.lastMessage || 'トークを始めよう'}</span></div><ChevronRight size={16} /></button> })}{!conversations.length && !dmError && <Empty emoji="💬" title="まだトークはありません" body="友達のカードから話しかけられます。" />}</aside><div className="chat-panel">{selectedConversation && activeConversationFriend ? <><header><button type="button" className="chat-back" onClick={() => setSelectedConversation(null)} aria-label="トーク一覧へ戻る"><ChevronLeft size={19} /></button><Avatar config={activeConversationFriend.avatar} size="small" /><strong>{activeConversationFriend.name}</strong><span>友達</span></header><div className="message-list">{messages.map((message) => <div key={message.id} className={`message-bubble ${message.senderUid === user.uid ? 'is-mine' : ''}`}>{message.text}</div>)}</div><form className="message-form" onSubmit={sendMessage}><label className="sr-only" htmlFor="dm-message">メッセージ</label><input id="dm-message" value={messageText} onChange={(event) => setMessageText(event.target.value)} maxLength={500} placeholder="メッセージを書く" /><button disabled={busy || !messageText.trim()} aria-label="メッセージを送信">{busy ? '…' : <Send size={18} />}</button></form></> : <Empty emoji="🌻" title="トークを選んでください" body="友達同士だけの、安心できる会話です。" />}</div></div><h2 className="subheading">話せる友達</h2><div className="quick-friends">{friends.map((friend) => <button disabled={busy} key={friend.profile.uid} onClick={() => openConversation(friend.profile)}><Avatar config={friend.profile.avatar} size="small" /><span>{friend.profile.displayName}</span></button>)}</div></section>}

        {tab === 'groups' && <section className="page-section groups-page"><div className="page-title"><div><p className="section-kicker">CIRCLES</p><h1>グループ</h1><p>友達でなくても、招待された仲間と気配を共有できます。</p></div><button className="soft-button" onClick={() => setModal('status')}><Plus size={17} /> 気配を共有</button></div><div className="group-tools"><form onSubmit={createGroup}><h2>グループを作る</h2><input value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={20} placeholder="例：2年3組 放課後組" /><button disabled={busy || groupName.trim().length < 2}>作る</button></form><form onSubmit={joinGroup}><h2>招待コードで参加</h2><input value={groupCode} onChange={(event) => setGroupCode(event.target.value.toUpperCase())} maxLength={6} placeholder="ABC234" /><button disabled={busy || groupCode.length !== 6}>参加</button></form></div><div className="group-layout"><aside className="group-list"><h2>参加中</h2>{groups.map((group) => <button key={group.id} className={selectedGroup?.id === group.id ? 'is-active' : ''} onClick={() => setSelectedGroup(group)}><span>🌻</span><div><strong>{group.name}</strong><small>コード {group.inviteCode}</small></div><ChevronRight size={16} /></button>)}{!groups.length && <Empty emoji="👋" title="グループはまだありません" body="作るか、招待コードで参加しよう。" />}</aside><div className="group-detail">{selectedGroup ? <><header><div><h2>{selectedGroup.name}</h2><p>友達関係に関係なく、この中だけで見えます。</p></div><button onClick={() => copyCode(selectedGroup.inviteCode)}><Copy size={15} /> {selectedGroup.inviteCode}</button></header><div className="group-status-grid">{groupStatuses.length ? groupStatuses.map((status) => <article key={status.uid}><Avatar config={status.avatar} size="small" status={status.emoji} /><div><strong>{status.displayName}</strong><p>{status.emoji} {status.text}</p><small>{getRemainingLabel(status)}</small></div></article>) : <Empty emoji="🌙" title="いまは静かです" body="右上のボタンから、このグループだけに気配を共有できます。" />}</div></> : <Empty emoji="🌻" title="グループを選んでください" body="招待制の小さな居場所です。" />}</div></div></section>}

        {tab === 'settings' && <section className="page-section settings-page"><p className="section-kicker">YOU</p><h1>自分</h1><div className="profile-summary"><button className="profile-avatar-button" onClick={() => setModal('avatar')} aria-label="アイコンを変更"><Avatar config={profile.avatar} size="medium" /><span><Pencil size={14} /></span></button><div><strong>{profile.displayName}</strong><p>{followerCount} フォロワー</p><button onClick={() => copyCode()}>{profile.friendCode} <Copy size={14} /></button><button className="profile-edit-button" onClick={() => setModal('avatar')}><Pencil size={13} />アイコンを変更</button></div></div><h2 className="subheading">アカウント</h2><AccountSettings user={user} onNotice={(message) => { setNotice(message); window.setTimeout(() => setNotice(''), 6000) }} /><h2 className="subheading">通知</h2><button className={`push-settings-card ${pushState === 'granted' ? 'is-enabled' : ''}`} onClick={togglePushNotifications} disabled={pushState === 'loading' || pushState === 'unconfigured' || pushState === 'unsupported'}><Bell size={22} /><div><strong>端末への通知</strong><p>DM・誘い・友達申請だけをお知らせします。</p>{pushState === 'unconfigured' && <small>通知サーバーの公開後に利用できます</small>}{pushState === 'unsupported' && <small>この端末・ブラウザは通知に対応していません</small>}{pushState === 'denied' && <small>端末の設定から通知を許可してください</small>}</div><span>{pushState === 'loading' ? '確認中…' : pushState === 'granted' ? 'オン' : 'オフ'}</span></button>{isAdmin && <button className="admin-entry-button" onClick={() => { window.location.hash = 'admin'; window.location.reload() }}><ShieldCheck size={20} /><div><strong>管理画面を開く</strong><span>通報・ユーザー・広場を管理</span></div><ChevronRight size={18} /></button>}<h2 className="subheading">プライバシー</h2><div className="privacy-settings"><label><div><strong>状態は友達だけに公開</strong><p>相互に友達になった人だけが「ひま！」を見られます。</p></div><ShieldCheck size={21} /></label><label><div><strong>ゴーストモード</strong><p>オンの間は、今の状態を友達から一時的に隠します。</p></div><input type="checkbox" checked={profile.statusHidden ?? false} onChange={(event) => setGhostMode(event.target.checked)} /></label><label><div><strong>広場で見つけられる</strong><p>オフにするとプロフィール検索の対象外になります。</p></div><input type="checkbox" checked={profile.discoverable ?? true} onChange={(event) => updatePrivacy('discoverable', event.target.checked)} /></label></div><div className="safety-card"><ShieldCheck size={24} /><div><strong>安心を優先した設計</strong><p>位置情報は使いません。DMは相互の友達だけ、状態は期限が来ると自動で消えます。</p></div></div>{friends.length > 0 && <><h2 className="subheading">友達の管理</h2><div className="settings-list">{friends.map(({ profile: friend }) => <div className="settings-friend" key={friend.uid}><Avatar config={friend.avatar} size="small" /><strong>{friend.displayName}</strong><button onClick={() => removeFriend(friend)} aria-label={`${friend.displayName}さんを友達から削除`}><UserMinus size={16} /></button><button className="danger-text" onClick={() => removeFriend(friend, true)}>ブロック</button></div>)}</div></>}<div className="settings-actions"><button onClick={() => signOut(auth)}><LogOut size={18} /> ログアウト</button><button className="danger-text" onClick={deleteAccount}>アカウントを削除</button></div></section>}
      </div>

      <nav className="bottom-nav" aria-label="メインメニュー"><button className={tab === 'home' ? 'is-active' : ''} onClick={() => setTab('home')}><Home size={21} /><span>ホーム</span></button><button className={tab === 'friends' || tab === 'groups' || tab === 'square' ? 'is-active' : ''} onClick={() => setTab('friends')}><UsersRound size={21} /><span>友達</span></button><button className={tab === 'dm' ? 'is-active' : ''} onClick={() => setTab('dm')}><MessageCircle size={21} /><span>DM</span></button><button className={tab === 'settings' ? 'is-active' : ''} onClick={() => setTab('settings')}><UserRound size={21} /><span>自分</span></button></nav>

      {notice && <button className="toast" onClick={() => setNotice('')}>{notice}</button>}
      {modal === 'status' && <Modal title="今の状態を決めよう" onClose={() => setModal(null)}><StatusComposer groups={groups} currentStatus={profile.currentStatus} busy={busy} onSubmit={saveStatus} /></Modal>}
      {modal === 'avatar' && <Modal title="アイコンを変更" onClose={() => setModal(null)}><AvatarEditor current={profile.avatar} busy={busy} onSave={(avatar) => void saveAvatar(avatar)} /></Modal>}
      {modal === 'invite' && <Modal title="友達とつながる" onClose={() => setModal(null)}><div className="my-code-card"><p>あなたの友達コード</p><strong>{profile.friendCode}</strong><div><button onClick={() => copyCode()}><Copy size={16} /> コード</button><button onClick={shareInvite}><Share2 size={16} /> 招待リンク</button></div></div><div className="divider"><span>友達のコードを持っている</span></div><label className="code-input-label">友達コード<input value={friendCode} onChange={(event) => setFriendCode(event.target.value.toUpperCase())} maxLength={6} placeholder="ABC234" /></label><button className="primary-button" disabled={busy || friendCode.length !== 6} onClick={sendRequest}>{busy ? '送信中…' : '友達申請を送る'} {!busy && <Send size={17} />}</button><p className="modal-note">実際に知っている友達から受け取ったコードだけを使ってね。</p></Modal>}
      {modal === 'poke' && pokeTarget && <Modal title={`${pokeTarget.displayName}さんを誘う`} onClose={() => setModal(null)}><p className="invite-modal-lead">タップすると、すぐ相手のお知らせに届きます。</p><div className="invite-quick-options">{inviteOptions.map((option, index) => <button className={index === 0 ? 'is-recommended' : ''} key={option.value} onClick={() => sendInvite(pokeTarget, option.value)} disabled={busy}><span>{option.emoji}</span><strong>{option.inviteLabel}</strong>{index === 0 && <small>おすすめ</small>}</button>)}</div><form className="custom-invite-form" onSubmit={(event) => { event.preventDefault(); if (inviteMessage.trim()) sendInvite(pokeTarget, undefined, inviteMessage) }}><label>自由に誘う<input value={inviteMessage} onChange={(event) => setInviteMessage(event.target.value)} maxLength={60} placeholder="例：20時から通話しない？" /></label><button disabled={busy || !inviteMessage.trim()} aria-label="自由入力の誘いを送る"><Send size={17} /></button></form></Modal>}
      {modal === 'notifications' && <Modal title="お知らせ" onClose={() => setModal(null)}><div className="notification-list">{requests.map((request) => <article className="inbox-card" key={request.id}><Avatar config={request.fromAvatar} size="small" /><div><strong>{request.fromName}</strong><p>友達になりたいみたい</p></div><button className="accept-button" disabled={busy} onClick={() => respondToRequest(request, true)} aria-label={`${request.fromName}さんの申請を承認`}><Check size={17} /></button><button className="decline-button" disabled={busy} onClick={() => respondToRequest(request, false)} aria-label={`${request.fromName}さんの申請を断る`}><X size={17} /></button></article>)}{pokes.map((poke) => { const detail = pokeLabel(poke.kind); const activity = activityOption(poke.activity); return <button className={`poke-inbox-card ${poke.readAt ? '' : 'is-unread'}`} key={poke.id} onClick={() => !poke.readAt && updateDoc(doc(db, 'pokes', poke.id), { readAt: Date.now() })}><span className="poke-inbox-card__emoji">{activity?.emoji ?? detail.emoji}</span><div><strong>{poke.fromName}さんからのお誘い</strong><p>「{poke.message ?? detail.label}」</p></div>{!poke.readAt && <i className="unread-dot" aria-label="未読" />}</button> })}{!requests.length && !pokes.length && <Empty emoji="🔔" title="まだお知らせはありません" body="友達からの誘いや友達申請がここに届きます。" />}</div></Modal>}
      {modal === 'music' && selectedMusic && <Modal title="ステータスの音楽" onClose={() => { setModal(null); setSelectedMusic(null) }}><MusicPreviewPlayer music={selectedMusic} /></Modal>}
      {showPushPrompt && <NotificationPermissionPrompt busy={pushPromptBusy} onAnswer={answerPushPrompt} />}
    </main>
  )
}
