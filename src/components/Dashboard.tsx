import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
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
  ChevronLeft,
  ChevronRight,
  Compass,
  Copy,
  Eye,
  Home,
  LogOut,
  MessageCircle,
  Plus,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  UserMinus,
  UsersRound,
  X,
} from 'lucide-react'
import { auth, db } from '../lib/firebase'
import type {
  Conversation,
  DirectMessage,
  FriendEntry,
  FriendRequest,
  Group,
  GroupStatus,
  Note,
  Poke,
  PokeKind,
  PublicProfile,
  StatusShare,
  StatusVisibility,
  UserProfile,
} from '../lib/models'
import {
  createStatus,
  getRemainingLabel,
  normalizeStatus,
  pokeLabel,
  POKE_OPTIONS,
  STATUS_DURATIONS,
  STATUS_EMOJIS,
  VISIBILITY_LABELS,
} from '../lib/status'
import { Avatar } from './Avatar'

type Tab = 'home' | 'square' | 'dm' | 'groups' | 'settings'
type ModalKind = 'status' | 'invite' | 'poke' | 'notifications' | null
type FriendView = { profile: PublicProfile; status: StatusShare | null }

function timeOf(value?: { toMillis?: () => number }) {
  return value?.toMillis?.() ?? 0
}

function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
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

function Empty({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return <div className="social-empty"><span>{emoji}</span><h3>{title}</h3><p>{body}</p></div>
}

function StatusComposer({
  groups,
  initialVisibility,
  busy,
  onSubmit,
}: {
  groups: Group[]
  initialVisibility: Exclude<StatusVisibility, 'groups'>
  busy: boolean
  onSubmit: (value: { text: string; emoji: string; visibility: StatusVisibility; duration: number; groupIds: string[] }) => void
}) {
  const [text, setText] = useState('')
  const [emoji, setEmoji] = useState('🌻')
  const [visibility, setVisibility] = useState<StatusVisibility>(initialVisibility)
  const [duration, setDuration] = useState(60)
  const [groupIds, setGroupIds] = useState<string[]>([])

  return (
    <form className="status-composer" onSubmit={(event) => {
      event.preventDefault()
      if (text.trim()) onSubmit({ text, emoji, visibility, duration, groupIds })
    }}>
      <label className="composer-input"><span>{emoji}</span><input value={text} onChange={(event) => setText(event.target.value)} placeholder="例：放課後ゲームできる人いる？" maxLength={60} autoFocus /></label>
      <div className="emoji-row" aria-label="絵文字を選ぶ">{STATUS_EMOJIS.map((item) => <button type="button" key={item} className={emoji === item ? 'is-selected' : ''} onClick={() => setEmoji(item)}>{item}</button>)}</div>
      <div className="form-grid">
        <label>公開範囲<select value={visibility} onChange={(event) => setVisibility(event.target.value as StatusVisibility)}>
          <option value="friends">友達だけ</option><option value="followers">フォロワーまで</option><option value="public">みんなに公開</option>{groups.length > 0 && <option value="groups">グループだけ</option>}
        </select></label>
        <label>表示時間<select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>{STATUS_DURATIONS.map((item) => <option value={item.minutes} key={item.minutes}>{item.label}</option>)}</select></label>
      </div>
      {visibility === 'groups' && <fieldset className="group-picker"><legend>共有するグループ</legend>{groups.map((group) => <label key={group.id}><input type="checkbox" checked={groupIds.includes(group.id)} onChange={() => setGroupIds((current) => current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id])} /> {group.name}</label>)}</fieldset>}
      <p className="privacy-hint"><Eye size={14} /> {VISIBILITY_LABELS[visibility].description}</p>
      <button className="primary-button" type="submit" disabled={busy || !text.trim() || (visibility === 'groups' && groupIds.length === 0)}>{busy ? '共有中…' : 'この気配を共有'} <Send size={17} /></button>
    </form>
  )
}

function FriendCard({ friend, onPoke, onMessage }: { friend: FriendView; onPoke: () => void; onMessage: () => void }) {
  const status = normalizeStatus(friend.status)
  return (
    <article className={`friend-card ${status ? '' : 'friend-card--quiet'}`}>
      <Avatar config={friend.profile.avatar} size="medium" status={status?.emoji} />
      <div className="friend-card__copy"><h3>{friend.profile.displayName}</h3><p>{status ? `${status.emoji} ${status.text}` : 'いまは静かです'}</p><small>{getRemainingLabel(status)}</small></div>
      <div className="friend-card__actions"><button className="poke-button" onClick={onPoke} disabled={!status}><Sparkles size={14} /> Poke</button><button className="circle-button" onClick={onMessage} aria-label="DMを送る"><MessageCircle size={17} /></button></div>
    </article>
  )
}

export function Dashboard({ user, profile, isAdmin = false }: { user: User; profile: UserProfile; isAdmin?: boolean }) {
  const [tab, setTab] = useState<Tab>('home')
  const [friends, setFriends] = useState<FriendView[]>([])
  const [friendIds, setFriendIds] = useState<string[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [pokes, setPokes] = useState<Poke[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [following, setFollowing] = useState<Set<string>>(new Set())
  const [followerCount, setFollowerCount] = useState(0)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [groupStatuses, setGroupStatuses] = useState<GroupStatus[]>([])
  const [modal, setModal] = useState<ModalKind>(null)
  const [pokeTarget, setPokeTarget] = useState<PublicProfile | null>(null)
  const [friendCode, setFriendCode] = useState('')
  const [noteText, setNoteText] = useState('')
  const [messageText, setMessageText] = useState('')
  const [groupName, setGroupName] = useState('')
  const [groupCode, setGroupCode] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const friendSubscriptions = useRef<Map<string, () => void>>(new Map())
  const profileCache = useRef<Map<string, PublicProfile>>(new Map())
  const statusCache = useRef<Map<string, StatusShare | null>>(new Map())
  const migratedProfileUid = useRef('')

  const ownStatus = normalizeStatus(profile.currentStatus)
  const unreadCount = useMemo(() => requests.length + pokes.filter((poke) => !poke.readAt).length, [pokes, requests])

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
    batch.set(doc(db, 'users', user.uid), { defaultStatusVisibility: profile.defaultStatusVisibility ?? 'friends', discoverable: profile.discoverable ?? true, bio: profile.bio ?? '' }, { merge: true })
    batch.set(doc(db, 'publicProfiles', user.uid), { ...socialProfile, updatedAt: serverTimestamp() }, { merge: true })
    if (profile.currentStatus?.kind && normalizeStatus(profile.currentStatus)) {
      const migrated = normalizeStatus(profile.currentStatus)!
      batch.set(doc(db, 'statusShares', user.uid), { ...migrated, uid: user.uid, displayName: profile.displayName, avatar: profile.avatar })
    }
    batch.commit().catch(() => undefined)
  }, [profile.avatar, profile.bio, profile.currentStatus, profile.defaultStatusVisibility, profile.discoverable, profile.displayName, user.uid])

  useEffect(() => onSnapshot(collection(db, 'users', user.uid, 'friends'), (snapshot) => setFriendIds(snapshot.docs.map((item) => (item.data() as FriendEntry).uid))), [user.uid])

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
  useEffect(() => onSnapshot(query(collection(db, 'conversations'), where('participants', 'array-contains', user.uid)), (snapshot) => setConversations(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Conversation).sort((a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt)))), [user.uid])

  useEffect(() => onSnapshot(collection(db, 'users', user.uid, 'groups'), async (snapshot) => {
    const loaded = await Promise.all(snapshot.docs.map(async (item) => {
      const group = await getDoc(doc(db, 'groups', item.id)).catch(() => null)
      return group?.exists() ? { id: group.id, ...group.data() } as Group : null
    }))
    setGroups(loaded.filter((item): item is Group => Boolean(item)))
  }), [user.uid])

  useEffect(() => {
    if (!selectedConversation) { setMessages([]); return }
    return onSnapshot(collection(db, 'conversations', selectedConversation.id, 'messages'), (snapshot) => setMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as DirectMessage).sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt))))
  }, [selectedConversation])

  useEffect(() => {
    if (!selectedGroup) { setGroupStatuses([]); return }
    return onSnapshot(collection(db, 'groups', selectedGroup.id, 'statuses'), (snapshot) => setGroupStatuses(snapshot.docs.map((item) => item.data() as GroupStatus).filter((item) => item.expiresAt > Date.now()).sort((a, b) => b.updatedAt - a.updatedAt)))
  }, [selectedGroup])

  async function saveStatus(value: { text: string; emoji: string; visibility: StatusVisibility; duration: number; groupIds: string[] }) {
    setBusy(true)
    try {
      const status = createStatus(value.text, value.emoji, value.visibility, value.duration, value.groupIds)
      const batch = writeBatch(db)
      batch.set(doc(db, 'users', user.uid), { currentStatus: status, ...(value.visibility !== 'groups' ? { defaultStatusVisibility: value.visibility } : {}) }, { merge: true })
      groups.forEach((group) => batch.delete(doc(db, 'groups', group.id, 'statuses', user.uid)))
      if (value.visibility === 'groups') {
        batch.delete(doc(db, 'statusShares', user.uid))
        value.groupIds.forEach((groupId) => batch.set(doc(db, 'groups', groupId, 'statuses', user.uid), { ...status, uid: user.uid, displayName: profile.displayName, avatar: profile.avatar }))
      } else {
        batch.set(doc(db, 'statusShares', user.uid), { ...status, uid: user.uid, displayName: profile.displayName, avatar: profile.avatar })
      }
      await batch.commit()
      setModal(null); setNotice('今の気配を共有しました')
    } catch { setNotice('気配を更新できませんでした') } finally { setBusy(false) }
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
      await setDoc(doc(db, 'friendRequests', `${user.uid}_${target.uid}`), { fromUid: user.uid, fromName: profile.displayName, fromAvatar: profile.avatar, toUid: target.uid, status: 'pending', createdAt: serverTimestamp() })
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
      }
      setNotice(accept ? `${request.fromName}さんと友達になりました` : '申請を断りました')
    } catch { setNotice('申請を更新できませんでした') } finally { setBusy(false) }
  }

  async function sendPoke(kind: PokeKind) {
    if (!pokeTarget) return
    setBusy(true)
    try {
      await addDoc(collection(db, 'pokes'), { fromUid: user.uid, fromName: profile.displayName, toUid: pokeTarget.uid, kind, readAt: null, createdAt: serverTimestamp() })
      setModal(null); setNotice(`${pokeTarget.displayName}さんに「${pokeLabel(kind).label}」を送りました`)
    } catch { setNotice('Pokeを送れませんでした') } finally { setBusy(false) }
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

  async function openConversation(friend: PublicProfile) {
    const id = [user.uid, friend.uid].sort().join('_')
    const conversation: Conversation = { id, participants: [user.uid, friend.uid], participantNames: { [user.uid]: profile.displayName, [friend.uid]: friend.displayName }, participantAvatars: { [user.uid]: profile.avatar, [friend.uid]: friend.avatar }, lastMessage: '' }
    await setDoc(doc(db, 'conversations', id), { ...conversation, updatedAt: serverTimestamp() }, { merge: true })
    setSelectedConversation(conversation); setTab('dm')
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault()
    if (!selectedConversation || !messageText.trim()) return
    const text = messageText.trim(); setMessageText('')
    const batch = writeBatch(db)
    batch.set(doc(collection(db, 'conversations', selectedConversation.id, 'messages')), { senderUid: user.uid, text, createdAt: serverTimestamp() })
    batch.set(doc(db, 'conversations', selectedConversation.id), { lastMessage: text, updatedAt: serverTimestamp() }, { merge: true })
    await batch.commit().catch(() => { setMessageText(text); setNotice('メッセージを送れませんでした') })
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

  async function copyCode(value = profile.friendCode) { await navigator.clipboard.writeText(value); setNotice('コードをコピーしました') }

  async function removeFriend(friend: PublicProfile, block = false) {
    if (!window.confirm(`${friend.displayName}さんを${block ? 'ブロック' : '友達から削除'}しますか？`)) return
    const batch = writeBatch(db); batch.delete(doc(db, 'users', user.uid, 'friends', friend.uid)); batch.delete(doc(db, 'users', friend.uid, 'friends', user.uid))
    if (block) batch.set(doc(db, 'users', user.uid, 'blocks', friend.uid), { uid: friend.uid, createdAt: serverTimestamp() })
    await batch.commit(); setNotice(block ? 'ブロックしました' : '友達から削除しました')
  }

  async function deleteAccount() {
    if (!window.confirm('アカウントを削除します。この操作は取り消せません。')) return
    try { await deleteDoc(doc(db, 'codes', profile.friendCode)); await deleteDoc(doc(db, 'publicProfiles', user.uid)); await deleteDoc(doc(db, 'users', user.uid)); await deleteUser(user) }
    catch { setNotice('再ログイン後にもう一度お試しください') }
  }

  const activeConversationFriend = selectedConversation ? {
    uid: selectedConversation.participants.find((id) => id !== user.uid) ?? '',
    name: selectedConversation.participantNames[selectedConversation.participants.find((id) => id !== user.uid) ?? ''] ?? '友達',
    avatar: selectedConversation.participantAvatars[selectedConversation.participants.find((id) => id !== user.uid) ?? ''],
  } : null

  return (
    <main className="app-shell">
      <header className="app-header"><div className="mini-brand"><span className="mini-brand__dot" /> HIMAWA</div><div className="header-actions"><button className="header-bell" onClick={() => setModal('notifications')} aria-label="お知らせ"><Bell size={19} />{unreadCount > 0 && <em>{unreadCount}</em>}</button><button className="header-avatar" onClick={() => setTab('settings')} aria-label="設定を開く"><Avatar config={profile.avatar} size="small" /></button></div></header>

      <div className="app-content">
        {tab === 'home' && <div className="home-dashboard">
          <section className="greeting-row"><div><p>{new Date().getHours() < 17 ? 'おつかれさま' : 'こんばんは'}、</p><h1>{profile.displayName}<span>さん</span></h1></div><button className="add-friend-button" onClick={() => setModal('invite')}><Plus size={18} /> 友達</button></section>
          <section className="my-status-card"><div className="my-status-card__top"><div><p className="section-kicker">YOUR MOMENT</p><div className={`free-status ${ownStatus ? '' : 'is-empty'}`}><span>{ownStatus?.emoji ?? '○'}</span><div><strong>{ownStatus?.text ?? '今の気配をひとことに'}</strong><small>{getRemainingLabel(ownStatus)}{ownStatus && ` · ${VISIBILITY_LABELS[ownStatus.visibility].label}`}</small></div></div></div><Avatar config={profile.avatar} size="large" status={ownStatus?.emoji} /></div><button className="status-change-button" aria-label={ownStatus ? '気配を書きかえる' : '気配を書く'} onClick={() => setModal('status')}><span>{ownStatus ? '気配を書きかえる' : '気配を書く'}</span><ChevronRight size={18} /></button></section>
          <section className="friends-section"><div className="section-heading"><div><p className="section-kicker">FRIENDS</p><h2>友達の今</h2></div><span>{friends.length}人</span></div>{friends.length ? <div className="friend-grid">{friends.map((friend) => <FriendCard key={friend.profile.uid} friend={friend} onPoke={() => { setPokeTarget(friend.profile); setModal('poke') }} onMessage={() => openConversation(friend.profile)} />)}</div> : <Empty emoji="🌱" title="友達を呼んでみよう" body="コードでつながると、ここにみんなの気配が並びます。" />}</section>
        </div>}

        {tab === 'square' && <section className="page-section social-page"><div className="page-title"><div><p className="section-kicker">SQUARE</p><h1>広場</h1><p>知り合う前の、軽いひとこと。写真も人気数もありません。</p></div><span className="live-chip">24hで消える</span></div><form className="note-composer" onSubmit={postNote}><Avatar config={profile.avatar} size="small" /><textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="みんなに聞いてみたいことは？" maxLength={160} /><footer><small>{noteText.length}/160</small><button disabled={busy || !noteText.trim()}><Send size={16} /> 放す</button></footer></form><div className="note-feed">{notes.length ? notes.map((note) => <article className="note-card" key={note.id}><Avatar config={note.authorAvatar} size="small" /><div><header><strong>{note.authorName}</strong><span>{Math.max(1, Math.ceil((note.expiresAt - Date.now()) / 3_600_000))}h</span></header><p>{note.text}</p>{note.authorUid !== user.uid && <button className={following.has(note.authorUid) ? 'is-following' : ''} onClick={() => toggleFollow(note.authorUid)}>{following.has(note.authorUid) ? 'フォロー中' : 'フォローする'}</button>}{note.authorUid === user.uid && <button className="delete-note" onClick={() => deleteDoc(doc(db, 'notes', note.id))}>削除</button>}</div></article>) : <Empty emoji="🫧" title="まだ静かな広場です" body="最初のひとことを放してみよう。" />}</div></section>}

        {tab === 'dm' && <section className="page-section dm-page"><div className="page-title"><div><p className="section-kicker">MESSAGES</p><h1>DM</h1><p>DMできるのは、お互いに友達の人だけです。</p></div></div><div className={`dm-layout ${selectedConversation ? 'has-chat' : ''}`}><aside className="conversation-list"><h2>トーク</h2>{conversations.map((conversation) => { const otherUid = conversation.participants.find((id) => id !== user.uid) ?? ''; return <button key={conversation.id} className={selectedConversation?.id === conversation.id ? 'is-active' : ''} onClick={() => setSelectedConversation(conversation)}><Avatar config={conversation.participantAvatars[otherUid]} size="small" /><div><strong>{conversation.participantNames[otherUid]}</strong><span>{conversation.lastMessage || 'トークを始めよう'}</span></div><ChevronRight size={16} /></button> })}{!conversations.length && <Empty emoji="💬" title="まだトークはありません" body="友達のカードから話しかけられます。" />}</aside><div className="chat-panel">{selectedConversation && activeConversationFriend ? <><header><button className="chat-back" onClick={() => setSelectedConversation(null)}><ChevronLeft size={19} /></button><Avatar config={activeConversationFriend.avatar} size="small" /><strong>{activeConversationFriend.name}</strong><span>友達</span></header><div className="message-list">{messages.map((message) => <div key={message.id} className={`message-bubble ${message.senderUid === user.uid ? 'is-mine' : ''}`}>{message.text}</div>)}</div><form className="message-form" onSubmit={sendMessage}><input value={messageText} onChange={(event) => setMessageText(event.target.value)} maxLength={500} placeholder="メッセージを書く" /><button disabled={!messageText.trim()}><Send size={18} /></button></form></> : <Empty emoji="🌻" title="トークを選んでください" body="友達同士だけの、安心できる会話です。" />}</div></div><h2 className="subheading">話せる友達</h2><div className="quick-friends">{friends.map((friend) => <button key={friend.profile.uid} onClick={() => openConversation(friend.profile)}><Avatar config={friend.profile.avatar} size="small" /><span>{friend.profile.displayName}</span></button>)}</div></section>}

        {tab === 'groups' && <section className="page-section groups-page"><div className="page-title"><div><p className="section-kicker">CIRCLES</p><h1>グループ</h1><p>友達でなくても、招待された仲間と気配を共有できます。</p></div><button className="soft-button" onClick={() => setModal('status')}><Plus size={17} /> 気配を共有</button></div><div className="group-tools"><form onSubmit={createGroup}><h2>グループを作る</h2><input value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={20} placeholder="例：2年3組 放課後組" /><button disabled={busy || groupName.trim().length < 2}>作る</button></form><form onSubmit={joinGroup}><h2>招待コードで参加</h2><input value={groupCode} onChange={(event) => setGroupCode(event.target.value.toUpperCase())} maxLength={6} placeholder="ABC234" /><button disabled={busy || groupCode.length !== 6}>参加</button></form></div><div className="group-layout"><aside className="group-list"><h2>参加中</h2>{groups.map((group) => <button key={group.id} className={selectedGroup?.id === group.id ? 'is-active' : ''} onClick={() => setSelectedGroup(group)}><span>🌻</span><div><strong>{group.name}</strong><small>コード {group.inviteCode}</small></div><ChevronRight size={16} /></button>)}{!groups.length && <Empty emoji="👋" title="グループはまだありません" body="作るか、招待コードで参加しよう。" />}</aside><div className="group-detail">{selectedGroup ? <><header><div><h2>{selectedGroup.name}</h2><p>友達関係に関係なく、この中だけで見えます。</p></div><button onClick={() => copyCode(selectedGroup.inviteCode)}><Copy size={15} /> {selectedGroup.inviteCode}</button></header><div className="group-status-grid">{groupStatuses.length ? groupStatuses.map((status) => <article key={status.uid}><Avatar config={status.avatar} size="small" status={status.emoji} /><div><strong>{status.displayName}</strong><p>{status.emoji} {status.text}</p><small>{getRemainingLabel(status)}</small></div></article>) : <Empty emoji="🌙" title="いまは静かです" body="右上のボタンから、このグループだけに気配を共有できます。" />}</div></> : <Empty emoji="🌻" title="グループを選んでください" body="招待制の小さな居場所です。" />}</div></div></section>}

        {tab === 'settings' && <section className="page-section settings-page"><p className="section-kicker">SETTINGS</p><h1>設定</h1><div className="profile-summary"><Avatar config={profile.avatar} size="medium" /><div><strong>{profile.displayName}</strong><p>{followerCount} フォロワー</p><button onClick={() => copyCode()}>{profile.friendCode} <Copy size={14} /></button></div></div>{isAdmin && <button className="admin-entry-button" onClick={() => { window.location.hash = 'admin'; window.location.reload() }}><ShieldCheck size={20} /><div><strong>管理画面を開く</strong><span>通報・ユーザー・広場を管理</span></div><ChevronRight size={18} /></button>}<h2 className="subheading">公開設定</h2><div className="privacy-settings"><label><div><strong>広場で見つけられる</strong><p>オフにするとプロフィール検索の対象外になります。</p></div><input type="checkbox" checked={profile.discoverable ?? true} onChange={(event) => updatePrivacy('discoverable', event.target.checked)} /></label><label><div><strong>気配の標準公開範囲</strong><p>気配を書くたびに変更もできます。</p></div><select value={profile.defaultStatusVisibility ?? 'friends'} onChange={(event) => updatePrivacy('defaultStatusVisibility', event.target.value)}><option value="friends">友達だけ</option><option value="followers">フォロワーまで</option><option value="public">みんなに公開</option></select></label></div><div className="safety-card"><ShieldCheck size={24} /><div><strong>安心を優先した設計</strong><p>位置情報は使いません。DMは相互の友達だけ、広場の投稿と気配は自動で消えます。</p></div></div>{friends.length > 0 && <><h2 className="subheading">友達の管理</h2><div className="settings-list">{friends.map(({ profile: friend }) => <div className="settings-friend" key={friend.uid}><Avatar config={friend.avatar} size="small" /><strong>{friend.displayName}</strong><button onClick={() => removeFriend(friend)}><UserMinus size={16} /></button><button className="danger-text" onClick={() => removeFriend(friend, true)}>ブロック</button></div>)}</div></>}<div className="settings-actions"><button onClick={() => signOut(auth)}><LogOut size={18} /> ログアウト</button><button className="danger-text" onClick={deleteAccount}>アカウントを削除</button></div></section>}
      </div>

      <nav className="bottom-nav" aria-label="メインメニュー"><button className={tab === 'home' ? 'is-active' : ''} onClick={() => setTab('home')}><Home size={21} /><span>ホーム</span></button><button className={tab === 'square' ? 'is-active' : ''} onClick={() => setTab('square')}><Compass size={21} /><span>広場</span></button><button className={tab === 'dm' ? 'is-active' : ''} onClick={() => setTab('dm')}><MessageCircle size={21} /><span>DM</span></button><button className={tab === 'groups' ? 'is-active' : ''} onClick={() => setTab('groups')}><UsersRound size={21} /><span>グループ</span></button><button className={tab === 'settings' ? 'is-active' : ''} onClick={() => setTab('settings')}><Settings size={21} /><span>設定</span></button></nav>

      {notice && <button className="toast" onClick={() => setNotice('')}>{notice}</button>}
      {modal === 'status' && <Modal title="今の気配を書く" onClose={() => setModal(null)}><StatusComposer groups={groups} initialVisibility={profile.defaultStatusVisibility ?? 'friends'} busy={busy} onSubmit={saveStatus} /></Modal>}
      {modal === 'invite' && <Modal title="友達とつながる" onClose={() => setModal(null)}><div className="my-code-card"><p>きみの友達コード</p><strong>{profile.friendCode}</strong><button onClick={() => copyCode()}><Copy size={16} /> コピー</button></div><div className="divider"><span>または</span></div><label className="code-input-label">友達のコード<input value={friendCode} onChange={(event) => setFriendCode(event.target.value.toUpperCase())} maxLength={6} placeholder="ABC234" /></label><button className="primary-button" disabled={busy} onClick={sendRequest}>友達申請を送る <Send size={17} /></button><p className="modal-note">知っている人から直接聞いたコードだけを使ってね。</p></Modal>}
      {modal === 'poke' && pokeTarget && <Modal title={`${pokeTarget.displayName}さんにPoke`} onClose={() => setModal(null)}><div className="poke-options">{POKE_OPTIONS.map((option) => <button key={option.kind} onClick={() => sendPoke(option.kind)} disabled={busy}><span>{option.emoji}</span><strong>{option.label}</strong></button>)}</div></Modal>}
      {modal === 'notifications' && <Modal title="お知らせ" onClose={() => setModal(null)}><div className="notification-list">{requests.map((request) => <article className="inbox-card" key={request.id}><Avatar config={request.fromAvatar} size="small" /><div><strong>{request.fromName}</strong><p>友達になりたいみたい</p></div><button className="accept-button" disabled={busy} onClick={() => respondToRequest(request, true)}><Check size={17} /></button><button className="decline-button" disabled={busy} onClick={() => respondToRequest(request, false)}><X size={17} /></button></article>)}{pokes.map((poke) => { const detail = pokeLabel(poke.kind); return <button className={`poke-inbox-card ${poke.readAt ? '' : 'is-unread'}`} key={poke.id} onClick={() => !poke.readAt && updateDoc(doc(db, 'pokes', poke.id), { readAt: Date.now() })}><span className="poke-inbox-card__emoji">{detail.emoji}</span><div><strong>{poke.fromName}</strong><p>「{detail.label}」</p></div></button> })}{!requests.length && !pokes.length && <Empty emoji="🔔" title="お知らせはありません" body="新しいPokeや友達申請がここに届きます。" />}</div></Modal>}
    </main>
  )
}
