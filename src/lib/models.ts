export type AvatarConfig = {
  skin: string
  hair: string
  outfit: string
  background: string
}

export type LegacyStatusKind =
  | 'available'
  | 'gaming'
  | 'studying'
  | 'moving'
  | 'later'
  | 'resting'
  | 'hidden'

export type StatusVisibility = 'friends' | 'followers' | 'public' | 'groups'

export type AvailabilityLevel = 'free' | 'maybe' | 'busy'

export type ActivityKind = 'game' | 'food' | 'outing' | 'talk' | 'sports' | 'study' | 'other'

type MusicAttachmentBase = {
  trackId: string
  url: string
  title: string
  artistName?: string
  thumbnailUrl?: string
}

export type MusicAttachment = MusicAttachmentBase & (
  | { provider: 'spotify' }
  | { provider: 'apple'; previewUrl?: string }
)

export type CurrentStatus = {
  text: string
  emoji: string
  availability?: AvailabilityLevel
  activities?: ActivityKind[]
  visibility: StatusVisibility
  expiresAt: number
  updatedAt: number
  groupIds?: string[]
  music?: MusicAttachment
  kind?: LegacyStatusKind
}

export type UserProfile = {
  uid: string
  displayName: string
  friendCode: string
  avatar: AvatarConfig
  currentStatus: CurrentStatus | null
  defaultStatusVisibility?: Exclude<StatusVisibility, 'groups'>
  discoverable?: boolean
  bio?: string
  statusHidden?: boolean
  pushPromptShownAt?: unknown
  createdAt?: unknown
}

export type PublicProfile = Pick<UserProfile, 'uid' | 'displayName' | 'avatar' | 'bio'> & {
  discoverable: boolean
  updatedAt?: unknown
}

export type StatusShare = CurrentStatus & {
  uid: string
  displayName: string
  avatar: AvatarConfig
}

export type FriendEntry = { uid: string; requestId: string; createdAt?: unknown }

export type FriendRequest = {
  id: string
  fromUid: string
  fromName: string
  fromAvatar: AvatarConfig
  toUid: string
  status: 'pending' | 'accepted' | 'declined'
  createdAt?: unknown
  respondedAt?: unknown
}

export type PokeKind = 'play' | 'game' | 'talk' | 'cheer'

export type Poke = {
  id: string
  fromUid: string
  fromName: string
  toUid: string
  kind: PokeKind
  activity?: ActivityKind
  message?: string
  readAt: number | null
  createdAt?: { toMillis?: () => number }
}

export type Note = {
  id: string
  authorUid: string
  authorName: string
  authorAvatar: AvatarConfig
  text: string
  expiresAt: number
  createdAt?: { toMillis?: () => number }
}

export type Conversation = {
  id: string
  participants: string[]
  participantNames: Record<string, string>
  participantAvatars: Record<string, AvatarConfig>
  lastMessage: string
  updatedAt?: { toMillis?: () => number }
}

export type DirectMessage = {
  id: string
  senderUid: string
  text: string
  createdAt?: { toMillis?: () => number }
}

export type Group = {
  id: string
  name: string
  ownerUid: string
  inviteCode: string
  createdAt?: unknown
}

export type GroupStatus = CurrentStatus & {
  uid: string
  displayName: string
  avatar: AvatarConfig
}

export type ModerationState = {
  status: 'active' | 'suspended'
  reason?: string
  updatedAt?: unknown
  updatedBy?: string
}

export type Report = {
  id: string
  reporterUid: string
  targetUid: string
  reason: string
  status?: 'pending' | 'resolved' | 'dismissed'
  createdAt?: { toMillis?: () => number }
  reviewedAt?: unknown
  reviewedBy?: string
}

export type ModerationAction = {
  id: string
  action: 'suspend_user' | 'restore_user' | 'delete_note' | 'resolve_report' | 'dismiss_report'
  actorUid: string
  targetUid?: string
  targetId?: string
  detail?: string
  createdAt?: { toMillis?: () => number }
}
