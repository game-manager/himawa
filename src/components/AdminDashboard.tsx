import { useEffect, useMemo, useState } from 'react'
import type { User } from 'firebase/auth'
import { signOut } from 'firebase/auth'
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { ArrowLeft, Ban, CheckCircle2, FileWarning, LayoutDashboard, LogOut, MessageSquareText, Search, ShieldCheck, Users, UsersRound } from 'lucide-react'
import { auth, db } from '../lib/firebase'
import type { Group, ModerationAction, ModerationState, Note, PublicProfile, Report, UserProfile } from '../lib/models'
import { Avatar } from './Avatar'

type AdminTab = 'overview' | 'users' | 'reports' | 'notes' | 'groups' | 'audit'

function timeOf(value?: { toMillis?: () => number }) { return value?.toMillis?.() ?? 0 }
function dateLabel(value?: { toMillis?: () => number }) {
  const time = timeOf(value)
  return time ? new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(time) : '日時不明'
}

export function AdminDashboard({ user, profile }: { user: User; profile: UserProfile }) {
  const [tab, setTab] = useState<AdminTab>('overview')
  const [profiles, setProfiles] = useState<PublicProfile[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [moderation, setModeration] = useState<Record<string, ModerationState>>({})
  const [actions, setActions] = useState<ModerationAction[]>([])
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => onSnapshot(collection(db, 'publicProfiles'), (snapshot) => setProfiles(snapshot.docs.map((item) => item.data() as PublicProfile))), [])
  useEffect(() => onSnapshot(collection(db, 'notes'), (snapshot) => setNotes(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Note).sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt)))), [])
  useEffect(() => onSnapshot(collection(db, 'reports'), (snapshot) => setReports(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Report).sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt)))), [])
  useEffect(() => onSnapshot(collection(db, 'groups'), (snapshot) => setGroups(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Group))), [])
  useEffect(() => onSnapshot(collection(db, 'moderation'), (snapshot) => setModeration(Object.fromEntries(snapshot.docs.map((item) => [item.id, item.data() as ModerationState])))), [])
  useEffect(() => onSnapshot(collection(db, 'moderationActions'), (snapshot) => setActions(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as ModerationAction).sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt)).slice(0, 100))), [])

  const pendingReports = reports.filter((item) => !item.status || item.status === 'pending')
  const filteredProfiles = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return profiles.filter((item) => !keyword || item.displayName.toLowerCase().includes(keyword) || item.uid.toLowerCase().includes(keyword))
  }, [profiles, search])
  const profileMap = useMemo(() => new Map(profiles.map((item) => [item.uid, item])), [profiles])

  async function logAction(action: ModerationAction['action'], values: Partial<ModerationAction>) {
    await setDoc(doc(collection(db, 'moderationActions')), { action, actorUid: user.uid, ...values, createdAt: serverTimestamp() })
  }

  async function toggleSuspension(target: PublicProfile) {
    const suspended = moderation[target.uid]?.status === 'suspended'
    if (target.uid === user.uid) { setNotice('自分自身は停止できません'); return }
    const reason = suspended ? '管理者による停止解除' : window.prompt(`${target.displayName}さんを停止する理由を入力してください`, '安全確認のため一時停止')
    if (!reason) return
    await setDoc(doc(db, 'moderation', target.uid), { status: suspended ? 'active' : 'suspended', reason, updatedAt: serverTimestamp(), updatedBy: user.uid })
    await logAction(suspended ? 'restore_user' : 'suspend_user', { targetUid: target.uid, detail: reason })
    setNotice(suspended ? '利用停止を解除しました' : 'ユーザーを利用停止にしました')
  }

  async function removeNote(note: Note) {
    if (!window.confirm(`「${note.text.slice(0, 40)}」を広場から削除しますか？`)) return
    await deleteDoc(doc(db, 'notes', note.id))
    await logAction('delete_note', { targetUid: note.authorUid, targetId: note.id, detail: note.text.slice(0, 80) })
    setNotice('投稿を削除しました')
  }

  async function reviewReport(report: Report, status: 'resolved' | 'dismissed') {
    await updateDoc(doc(db, 'reports', report.id), { status, reviewedAt: serverTimestamp(), reviewedBy: user.uid })
    await logAction(status === 'resolved' ? 'resolve_report' : 'dismiss_report', { targetUid: report.targetUid, targetId: report.id, detail: report.reason })
    setNotice(status === 'resolved' ? '対応済みにしました' : '問題なしとして閉じました')
  }

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'overview', label: '概要', icon: <LayoutDashboard size={19} /> },
    { id: 'users', label: 'ユーザー', icon: <Users size={19} /> },
    { id: 'reports', label: '通報', icon: <FileWarning size={19} />, badge: pendingReports.length },
    { id: 'notes', label: '広場', icon: <MessageSquareText size={19} /> },
    { id: 'groups', label: 'グループ', icon: <UsersRound size={19} /> },
    { id: 'audit', label: '操作履歴', icon: <ShieldCheck size={19} /> },
  ]

  return <main className="admin-shell">
    <aside className="admin-sidebar">
      <div className="admin-brand"><span className="mini-brand__dot" /><div><strong>HIMAWA</strong><small>ADMIN</small></div></div>
      <nav>{navItems.map((item) => <button key={item.id} className={tab === item.id ? 'is-active' : ''} onClick={() => setTab(item.id)}>{item.icon}<span>{item.label}</span>{Boolean(item.badge) && <em>{item.badge}</em>}</button>)}</nav>
      <div className="admin-account"><Avatar config={profile.avatar} size="small" /><div><strong>{profile.displayName}</strong><small>管理者</small></div><button onClick={() => signOut(auth)} aria-label="ログアウト"><LogOut size={17} /></button></div>
    </aside>

    <section className="admin-main">
      <header className="admin-topbar"><button onClick={() => { window.location.hash = ''; window.location.reload() }}><ArrowLeft size={17} /> アプリへ戻る</button><span><ShieldCheck size={16} /> 管理者専用</span></header>

      {tab === 'overview' && <><div className="admin-title"><p>OVERVIEW</p><h1>運営ダッシュボード</h1><span>サービスの状態と、対応が必要な項目を確認できます。</span></div><div className="admin-metrics"><article><Users size={20} /><div><strong>{profiles.length}</strong><span>ユーザー</span></div></article><article><FileWarning size={20} /><div><strong>{pendingReports.length}</strong><span>未対応の通報</span></div></article><article><MessageSquareText size={20} /><div><strong>{notes.filter((item) => item.expiresAt > Date.now()).length}</strong><span>公開中の投稿</span></div></article><article><Ban size={20} /><div><strong>{Object.values(moderation).filter((item) => item.status === 'suspended').length}</strong><span>利用停止中</span></div></article></div><div className="admin-overview-grid"><section><div className="admin-section-heading"><h2>対応が必要な通報</h2><button onClick={() => setTab('reports')}>すべて見る</button></div>{pendingReports.slice(0, 5).map((report) => <ReportRow key={report.id} report={report} profileMap={profileMap} onReview={reviewReport} />)}{!pendingReports.length && <AdminEmpty text="未対応の通報はありません" />}</section><section><div className="admin-section-heading"><h2>最近の操作</h2><button onClick={() => setTab('audit')}>すべて見る</button></div>{actions.slice(0, 6).map((action) => <ActionRow key={action.id} action={action} profileMap={profileMap} />)}{!actions.length && <AdminEmpty text="管理操作はまだありません" />}</section></div></>}

      {tab === 'users' && <><div className="admin-title"><p>USERS</p><h1>ユーザー管理</h1><span>検索、利用状況の確認、アプリ利用停止を行います。</span></div><label className="admin-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="表示名またはUIDで検索" /></label><div className="admin-table"><div className="admin-table__head"><span>ユーザー</span><span>公開状態</span><span>利用状態</span><span>操作</span></div>{filteredProfiles.map((item) => { const suspended = moderation[item.uid]?.status === 'suspended'; return <div className="admin-table__row" key={item.uid}><div className="admin-user"><Avatar config={item.avatar} size="small" /><div><strong>{item.displayName}</strong><small>{item.uid}</small></div></div><span className={`admin-pill ${item.discoverable ? 'is-green' : ''}`}>{item.discoverable ? '公開' : '非公開'}</span><span className={`admin-pill ${suspended ? 'is-red' : 'is-green'}`}>{suspended ? '停止中' : '利用中'}</span><button className={suspended ? 'admin-restore' : 'admin-danger'} onClick={() => toggleSuspension(item)} disabled={item.uid === user.uid}>{suspended ? '停止解除' : '利用停止'}</button></div>})}</div></>}

      {tab === 'reports' && <><div className="admin-title"><p>REPORTS</p><h1>通報管理</h1><span>DMの本文は表示せず、通報された対象と理由だけを扱います。</span></div><div className="admin-card-list">{reports.map((report) => <ReportRow key={report.id} report={report} profileMap={profileMap} onReview={reviewReport} expanded />)}{!reports.length && <AdminEmpty text="通報はありません" />}</div></>}

      {tab === 'notes' && <><div className="admin-title"><p>SQUARE</p><h1>広場の管理</h1><span>公開中・期限切れの短文を確認し、不適切な投稿を削除できます。</span></div><div className="admin-card-list">{notes.map((note) => <article className="admin-note" key={note.id}><Avatar config={note.authorAvatar} size="small" /><div><header><strong>{note.authorName}</strong><span>{dateLabel(note.createdAt)} · {note.expiresAt > Date.now() ? '公開中' : '期限切れ'}</span></header><p>{note.text}</p></div><button className="admin-danger" onClick={() => removeNote(note)}>削除</button></article>)}{!notes.length && <AdminEmpty text="広場の投稿はありません" />}</div></>}

      {tab === 'groups' && <><div className="admin-title"><p>GROUPS</p><h1>グループ一覧</h1><span>グループ名と所有者のみ確認できます。グループ内の気配は表示しません。</span></div><div className="admin-group-grid">{groups.map((group) => <article key={group.id}><span>🌻</span><div><strong>{group.name}</strong><small>所有者：{profileMap.get(group.ownerUid)?.displayName ?? group.ownerUid}</small><small>ID：{group.id}</small></div></article>)}{!groups.length && <AdminEmpty text="グループはありません" />}</div></>}

      {tab === 'audit' && <><div className="admin-title"><p>AUDIT LOG</p><h1>管理操作の履歴</h1><span>管理者が行った停止・削除・通報対応を記録します。</span></div><div className="admin-card-list">{actions.map((action) => <ActionRow key={action.id} action={action} profileMap={profileMap} expanded />)}{!actions.length && <AdminEmpty text="管理操作はまだありません" />}</div></>}
    </section>
    {notice && <button className="toast" onClick={() => setNotice('')}>{notice}</button>}
  </main>
}

function AdminEmpty({ text }: { text: string }) { return <div className="admin-empty"><CheckCircle2 size={24} /><p>{text}</p></div> }

function ReportRow({ report, profileMap, onReview, expanded = false }: { report: Report; profileMap: Map<string, PublicProfile>; onReview: (report: Report, status: 'resolved' | 'dismissed') => void; expanded?: boolean }) {
  const target = profileMap.get(report.targetUid)
  const reporter = profileMap.get(report.reporterUid)
  const pending = !report.status || report.status === 'pending'
  return <article className={`admin-report ${expanded ? 'is-expanded' : ''}`}><FileWarning size={20} /><div><header><strong>{target?.displayName ?? '不明なユーザー'}への通報</strong><span className={`admin-pill ${pending ? 'is-red' : 'is-green'}`}>{pending ? '未対応' : report.status === 'resolved' ? '対応済み' : '問題なし'}</span></header><p>{report.reason || '理由なし'}</p><small>通報者：{reporter?.displayName ?? report.reporterUid} · {dateLabel(report.createdAt)}</small></div>{pending && <footer><button onClick={() => onReview(report, 'dismissed')}>問題なし</button><button className="admin-primary" onClick={() => onReview(report, 'resolved')}>対応済み</button></footer>}</article>
}

function ActionRow({ action, profileMap, expanded = false }: { action: ModerationAction; profileMap: Map<string, PublicProfile>; expanded?: boolean }) {
  const labels: Record<ModerationAction['action'], string> = { suspend_user: 'ユーザーを停止', restore_user: '利用停止を解除', delete_note: '広場の投稿を削除', resolve_report: '通報に対応', dismiss_report: '通報を問題なしで終了' }
  return <article className={`admin-action ${expanded ? 'is-expanded' : ''}`}><ShieldCheck size={18} /><div><strong>{labels[action.action] ?? action.action}</strong><p>{action.targetUid ? `対象：${profileMap.get(action.targetUid)?.displayName ?? action.targetUid}` : ''}{action.detail ? ` · ${action.detail}` : ''}</p><small>{dateLabel(action.createdAt)}</small></div></article>
}
