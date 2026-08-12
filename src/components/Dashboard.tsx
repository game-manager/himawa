import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { deleteUser, signOut } from 'firebase/auth'
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
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Home,
  LogOut,
  Plus,
  Send,
  Settings,
  ShieldCheck,
  UserMinus,
  X,
} from 'lucide-react'
import { auth, db } from '../lib/firebase'
import type { FriendEntry, FriendRequest, Poke, PokeKind, StatusKind, UserProfile } from '../lib/models'
import { createStatus, getRemainingLabel, getStatusDefinition, pokeLabel, POKE_OPTIONS, STATUS_OPTIONS } from '../lib/status'
import { Avatar } from './Avatar'

type Tab = 'home' | 'inbox' | 'settings'

function timeOf(value?: { toMillis?: () => number }) {
  return value?.toMillis?.() ?? 0
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-handle" />
        <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="閉じる"><X size={20} /></button></header>
        {children}
      </section>
    </div>
  )
}

function StatusPill({ profile }: { profile: UserProfile }) {
  const active = getStatusDefinition(profile.currentStatus)
  return (
    <div className={`status-pill ${active ? '' : 'status-pill--off'}`} style={active ? { '--status-color': active.color } as React.CSSProperties : undefined}>
      <span>{active?.emoji ?? '○'}</span>
      <strong>{active?.label ?? '気配はオフ'}</strong>
      <small>{getRemainingLabel(profile.currentStatus)}</small>
    </div>
  )
}

function FriendCard({ profile, onPoke }: { profile: UserProfile; onPoke: (profile: UserProfile) => void }) {
  const active = getStatusDefinition(profile.currentStatus)
  return (
    <article className={`friend-card ${active ? '' : 'friend-card--quiet'}`}>
      <Avatar config={profile.avatar} size="medium" status={active?.kind ?? null} />
      <div className="friend-card__copy">
        <h3>{profile.displayName}</h3>
        <p>{active ? `${active.emoji} ${active.shortLabel}` : '気配はオフ'}</p>
        <small>{getRemainingLabel(profile.currentStatus)}</small>
      </div>
      <button className="poke-button" onClick={() => onPoke(profile)} disabled={!active || active.kind === 'hidden'}>
        <Send size={15} /> 声かける
      </button>
    </article>
  )
}

export function Dashboard({ user, profile }: { user: User; profile: UserProfile }) {
  const [tab, setTab] = useState<Tab>('home')
  const [friends, setFriends] = useState<UserProfile[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [pokes, setPokes] = useState<Poke[]>([])
  const [modal, setModal] = useState<'status' | 'invite' | 'poke' | null>(null)
  const [pokeTarget, setPokeTarget] = useState<UserProfile | null>(null)
  const [friendCode, setFriendCode] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const profileSubscriptions = useRef<Map<string, () => void>>(new Map())

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users', user.uid, 'friends'), (snapshot) => {
      const entries = snapshot.docs.map((item) => item.data() as FriendEntry)
      const expectedIds = new Set(entries.map((entry) => entry.uid))
      profileSubscriptions.current.forEach((stop, uid) => {
        if (!expectedIds.has(uid)) {
          stop()
          profileSubscriptions.current.delete(uid)
        }
      })
      if (!entries.length) setFriends([])
      entries.forEach((entry) => {
        if (profileSubscriptions.current.has(entry.uid)) return
        const stop = onSnapshot(
          doc(db, 'users', entry.uid),
          (friendSnapshot) => {
            if (!friendSnapshot.exists()) return
            const friend = friendSnapshot.data() as UserProfile
            setFriends((current) => [...current.filter((item) => item.uid !== friend.uid), friend].sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja')))
          },
          () => setFriends((current) => current.filter((item) => item.uid !== entry.uid)),
        )
        profileSubscriptions.current.set(entry.uid, stop)
      })
    })
    return () => {
      unsubscribe()
      profileSubscriptions.current.forEach((stop) => stop())
      profileSubscriptions.current.clear()
    }
  }, [user.uid])

  useEffect(() => {
    const requestQuery = query(collection(db, 'friendRequests'), where('toUid', '==', user.uid))
    return onSnapshot(requestQuery, (snapshot) => {
      setRequests(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as FriendRequest).filter((item) => item.status === 'pending'))
    })
  }, [user.uid])

  useEffect(() => {
    const pokeQuery = query(collection(db, 'pokes'), where('toUid', '==', user.uid))
    return onSnapshot(pokeQuery, (snapshot) => {
      setPokes(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Poke).sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt)).slice(0, 30))
    })
  }, [user.uid])

  const unreadCount = useMemo(() => requests.length + pokes.filter((poke) => !poke.readAt).length, [pokes, requests])

  async function chooseStatus(kind: StatusKind) {
    setBusy(true)
    try {
      await updateDoc(doc(db, 'users', user.uid), { currentStatus: createStatus(kind) })
      setModal(null)
      setNotice('気配を更新しました')
    } catch {
      setNotice('更新できませんでした')
    } finally {
      setBusy(false)
    }
  }

  async function sendRequest() {
    const code = friendCode.trim().toUpperCase()
    if (code.length !== 6) {
      setNotice('6文字の友達コードを入力してください')
      return
    }
    setBusy(true)
    try {
      const codeSnapshot = await getDoc(doc(db, 'codes', code))
      if (!codeSnapshot.exists()) throw new Error('NOT_FOUND')
      const target = codeSnapshot.data() as { uid: string; displayName: string }
      if (target.uid === user.uid) throw new Error('SELF')
      if (friends.some((friend) => friend.uid === target.uid)) throw new Error('ALREADY_FRIENDS')
      const requestId = `${user.uid}_${target.uid}`
      await setDoc(doc(db, 'friendRequests', requestId), {
        fromUid: user.uid,
        fromName: profile.displayName,
        fromAvatar: profile.avatar,
        toUid: target.uid,
        status: 'pending',
        createdAt: serverTimestamp(),
      })
      setFriendCode('')
      setModal(null)
      setNotice(`${target.displayName}さんに申請しました`)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : ''
      setNotice(message === 'SELF' ? '自分のコードです' : message === 'ALREADY_FRIENDS' ? 'すでに友達です' : 'コードが見つかりませんでした')
    } finally {
      setBusy(false)
    }
  }

  async function respondToRequest(request: FriendRequest, accept: boolean) {
    setBusy(true)
    try {
      if (!accept) {
        await updateDoc(doc(db, 'friendRequests', request.id), { status: 'declined', respondedAt: serverTimestamp() })
      } else {
        const batch = writeBatch(db)
        batch.update(doc(db, 'friendRequests', request.id), { status: 'accepted', respondedAt: serverTimestamp() })
        batch.set(doc(db, 'users', user.uid, 'friends', request.fromUid), { uid: request.fromUid, requestId: request.id, createdAt: serverTimestamp() })
        batch.set(doc(db, 'users', request.fromUid, 'friends', user.uid), { uid: user.uid, requestId: request.id, createdAt: serverTimestamp() })
        await batch.commit()
      }
      setNotice(accept ? `${request.fromName}さんと友達になりました` : '申請を断りました')
    } catch {
      setNotice('申請を更新できませんでした')
    } finally {
      setBusy(false)
    }
  }

  function openPoke(friend: UserProfile) {
    setPokeTarget(friend)
    setModal('poke')
  }

  async function sendPoke(kind: PokeKind) {
    if (!pokeTarget) return
    setBusy(true)
    try {
      await addDoc(collection(db, 'pokes'), {
        fromUid: user.uid,
        fromName: profile.displayName,
        toUid: pokeTarget.uid,
        kind,
        readAt: null,
        createdAt: serverTimestamp(),
      })
      setModal(null)
      setNotice(`${pokeTarget.displayName}さんに「${pokeLabel(kind).label}」を送りました`)
    } catch {
      setNotice('Pokeを送れませんでした')
    } finally {
      setBusy(false)
    }
  }

  async function markPokeRead(poke: Poke) {
    if (poke.readAt) return
    await updateDoc(doc(db, 'pokes', poke.id), { readAt: Date.now() })
  }

  async function copyCode() {
    await navigator.clipboard.writeText(profile.friendCode)
    setNotice('友達コードをコピーしました')
  }

  async function removeFriend(friend: UserProfile, block = false) {
    if (!window.confirm(`${friend.displayName}さんを${block ? 'ブロック' : '友達から削除'}しますか？`)) return
    const batch = writeBatch(db)
    batch.delete(doc(db, 'users', user.uid, 'friends', friend.uid))
    batch.delete(doc(db, 'users', friend.uid, 'friends', user.uid))
    if (block) batch.set(doc(db, 'users', user.uid, 'blocks', friend.uid), { uid: friend.uid, createdAt: serverTimestamp() })
    await batch.commit()
    setNotice(block ? 'ブロックしました' : '友達から削除しました')
  }

  async function reportFriend(friend: UserProfile) {
    if (!window.confirm(`${friend.displayName}さんを運営に通報しますか？`)) return
    await addDoc(collection(db, 'reports'), { reporterUid: user.uid, targetUid: friend.uid, reason: 'other', createdAt: serverTimestamp() })
    setNotice('通報を受け付けました')
  }

  async function deleteAccount() {
    if (!window.confirm('アカウントを削除します。この操作は取り消せません。')) return
    try {
      await deleteDoc(doc(db, 'codes', profile.friendCode))
      await deleteDoc(doc(db, 'users', user.uid))
      await deleteUser(user)
    } catch {
      setNotice('再ログイン後にもう一度お試しください')
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="mini-brand"><span className="mini-brand__dot" /> HIMAWA</div>
        <button className="header-avatar" onClick={() => setTab('settings')} aria-label="設定を開く"><Avatar config={profile.avatar} size="small" /></button>
      </header>

      <div className="app-content">
        {tab === 'home' && (
          <>
            <section className="greeting-row">
              <div><p>{new Date().getHours() < 17 ? 'おつかれさま' : 'こんばんは'}、</p><h1>{profile.displayName}<span>さん</span></h1></div>
              <button className="add-friend-button" onClick={() => setModal('invite')}><Plus size={18} /> 友達</button>
            </section>

            <section className="my-status-card">
              <div className="my-status-card__top">
                <div><p className="section-kicker">きみの今</p><StatusPill profile={profile} /></div>
                <Avatar config={profile.avatar} size="large" status={getStatusDefinition(profile.currentStatus)?.kind ?? null} />
              </div>
              <button className="status-change-button" onClick={() => setModal('status')}>気配を変える <ChevronRight size={18} /></button>
            </section>

            <section className="friends-section">
              <div className="section-heading"><div><p className="section-kicker">FRIENDS</p><h2>みんなの今</h2></div><span>{friends.length}人</span></div>
              {friends.length ? (
                <div className="friend-grid">{friends.map((friend) => <FriendCard key={friend.uid} profile={friend} onPoke={openPoke} />)}</div>
              ) : (
                <div className="empty-state">
                  <div className="empty-state__faces"><span>🙂</span><span>😆</span><span>😌</span></div>
                  <h3>友達を呼んでみよう</h3>
                  <p>コードでつながると、ここにみんなの気配が並びます。</p>
                  <button className="secondary-button" onClick={() => setModal('invite')}><Plus size={17} /> 友達を追加</button>
                </div>
              )}
            </section>
          </>
        )}

        {tab === 'inbox' && (
          <section className="page-section">
            <p className="section-kicker">INBOX</p><h1>お知らせ</h1>
            {!!requests.length && <h2 className="subheading">友達申請</h2>}
            {requests.map((request) => (
              <article className="inbox-card" key={request.id}>
                <Avatar config={request.fromAvatar} size="small" />
                <div><strong>{request.fromName}</strong><p>友達になりたいみたい</p></div>
                <button className="accept-button" disabled={busy} onClick={() => respondToRequest(request, true)}><Check size={17} /></button>
                <button className="decline-button" disabled={busy} onClick={() => respondToRequest(request, false)}><X size={17} /></button>
              </article>
            ))}
            <h2 className="subheading">Poke</h2>
            {pokes.length ? pokes.map((poke) => {
              const detail = pokeLabel(poke.kind)
              return <button className={`poke-inbox-card ${poke.readAt ? '' : 'is-unread'}`} key={poke.id} onClick={() => markPokeRead(poke)}>
                <span className="poke-inbox-card__emoji">{detail.emoji}</span><div><strong>{poke.fromName}</strong><p>「{detail.label}」</p></div>{!poke.readAt && <span className="unread-dot" />}
              </button>
            }) : <div className="empty-small"><Bell size={24} /><p>まだPokeはありません</p></div>}
          </section>
        )}

        {tab === 'settings' && (
          <section className="page-section settings-page">
            <p className="section-kicker">SETTINGS</p><h1>設定</h1>
            <div className="profile-summary"><Avatar config={profile.avatar} size="medium" /><div><strong>{profile.displayName}</strong><p>友達コード</p><button onClick={copyCode}>{profile.friendCode} <Copy size={14} /></button></div></div>
            <div className="safety-card"><ShieldCheck size={24} /><div><strong>追跡しない安心設計</strong><p>位置情報や行動履歴は保存しません。気配は時間が来ると自動で消えます。</p></div></div>
            {!!friends.length && <><h2 className="subheading">友達の管理</h2><div className="settings-list">{friends.map((friend) => <div className="settings-friend" key={friend.uid}><Avatar config={friend.avatar} size="small" /><strong>{friend.displayName}</strong><button onClick={() => reportFriend(friend)}>通報</button><button onClick={() => removeFriend(friend)}><UserMinus size={16} /></button><button className="danger-text" onClick={() => removeFriend(friend, true)}>ブロック</button></div>)}</div></>}
            <div className="settings-actions"><button onClick={() => signOut(auth)}><LogOut size={18} /> ログアウト</button><button className="danger-text" onClick={deleteAccount}>アカウントを削除</button></div>
          </section>
        )}
      </div>

      <nav className="bottom-nav" aria-label="メインメニュー">
        <button className={tab === 'home' ? 'is-active' : ''} onClick={() => setTab('home')}><Home size={21} /><span>ホーム</span></button>
        <button className={tab === 'inbox' ? 'is-active' : ''} onClick={() => setTab('inbox')}><span className="nav-icon-wrap"><Bell size={21} />{unreadCount > 0 && <em>{unreadCount > 9 ? '9+' : unreadCount}</em>}</span><span>Poke</span></button>
        <button className={tab === 'settings' ? 'is-active' : ''} onClick={() => setTab('settings')}><Settings size={21} /><span>設定</span></button>
      </nav>

      {notice && <button className="toast" onClick={() => setNotice('')}>{notice}</button>}

      {modal === 'status' && <Modal title="今の気配をえらぶ" onClose={() => setModal(null)}><div className="status-options">{STATUS_OPTIONS.map((option) => <button key={option.kind} onClick={() => chooseStatus(option.kind)} disabled={busy}><span style={{ background: option.color }}>{option.emoji}</span><div><strong>{option.label}</strong><small><Clock3 size={13} /> {option.durationMinutes < 60 ? `${option.durationMinutes}分` : `${option.durationMinutes / 60}時間`}で消える</small></div><ChevronRight size={18} /></button>)}</div></Modal>}

      {modal === 'invite' && <Modal title="友達とつながる" onClose={() => setModal(null)}><div className="my-code-card"><p>きみの友達コード</p><strong>{profile.friendCode}</strong><button onClick={copyCode}><Copy size={16} /> コピー</button></div><div className="divider"><span>または</span></div><label className="code-input-label">友達のコード<input value={friendCode} onChange={(event) => setFriendCode(event.target.value.toUpperCase())} maxLength={6} placeholder="ABC234" autoCapitalize="characters" /></label><button className="primary-button" disabled={busy} onClick={sendRequest}>{busy ? '探しています…' : '友達申請を送る'} <Send size={17} /></button><p className="modal-note">知らない人とはつながらず、友達から直接聞いたコードだけを使ってね。</p></Modal>}

      {modal === 'poke' && pokeTarget && <Modal title={`${pokeTarget.displayName}さんに声をかける`} onClose={() => setModal(null)}><div className="poke-options">{POKE_OPTIONS.map((option) => <button key={option.kind} onClick={() => sendPoke(option.kind)} disabled={busy}><span>{option.emoji}</span><strong>{option.label}</strong></button>)}</div></Modal>}
    </main>
  )
}
