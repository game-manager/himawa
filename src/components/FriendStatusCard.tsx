import { Clock3, MessageCircle, MoreHorizontal, Send } from 'lucide-react'
import type { ActivityKind, PublicProfile, StatusShare } from '../lib/models'
import { activityOption, availabilityOption, getAvailability, getRemainingLabel, getUpdatedLabel, normalizeStatus } from '../lib/status'
import { Avatar } from './Avatar'

export type FriendStatusView = { profile: PublicProfile; status: StatusShare | null }

export function FriendStatusCard({
  friend,
  now,
  onInvite,
  onInviteOptions,
  onMessage,
}: {
  friend: FriendStatusView
  now: number
  onInvite: (activity?: ActivityKind) => void
  onInviteOptions: () => void
  onMessage: () => void
}) {
  const status = normalizeStatus(friend.status, now)
  const availability = getAvailability(status)
  const availabilityMeta = availabilityOption(availability)
  const activities = status?.activities?.map((item) => activityOption(item)).filter((item): item is NonNullable<typeof item> => Boolean(item)) ?? []
  const preferred = activities[0]
  const canInvite = Boolean(status && availability !== 'busy')
  const defaultStatusText = availabilityMeta.label
  const note = status?.text && status.text !== defaultStatusText ? status.text : ''

  return (
    <article className={`friend-status-card friend-status-card--${availability}`}>
      <div className="friend-status-card__avatar"><Avatar config={friend.profile.avatar} size="medium" /></div>
      <div className="friend-status-card__main">
        <header><h3 title={friend.profile.displayName}>{friend.profile.displayName}</h3><span className={`availability-badge availability-badge--${availability}`}><i aria-hidden="true" />{availabilityMeta.shortLabel}</span></header>
        {activities.length > 0 ? <div className="friend-activities">{activities.map((item) => <span key={item.value}>{item.emoji} {item.statusLabel}</span>)}</div> : <p className="friend-no-activity">{canInvite ? '何するかは誘ってから決めよう' : '今は誘わないでほしいみたい'}</p>}
        {note && <p className="friend-status-note">「{note}」</p>}
        <div className="friend-status-meta"><span><Clock3 size={13} />{getRemainingLabel(status, now)}</span>{status && <span>{getUpdatedLabel(status, now)}</span>}</div>
      </div>
      <div className="friend-status-card__actions">
        <button className="invite-now-button" onClick={() => onInvite(preferred?.value)} disabled={!canInvite} aria-label={canInvite ? `${friend.profile.displayName}さんを${preferred?.inviteLabel ?? '誘う'}` : `${friend.profile.displayName}さんは今は誘えません`}>
          <Send size={16} /> {canInvite ? preferred ? `${preferred.emoji} ${preferred.inviteLabel}` : '誘う' : '今は誘わない'}
        </button>
        {canInvite && <button className="invite-options-button" onClick={onInviteOptions} aria-label={`${friend.profile.displayName}さんへの誘い方を選ぶ`}><MoreHorizontal size={18} /></button>}
        <button className="message-shortcut-button" onClick={onMessage} aria-label={`${friend.profile.displayName}さんにDMする`}><MessageCircle size={17} /></button>
      </div>
    </article>
  )
}
