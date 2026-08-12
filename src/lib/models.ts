export type AvatarConfig = {
  skin: string
  hair: string
  outfit: string
  background: string
}

export type StatusKind =
  | 'available'
  | 'gaming'
  | 'studying'
  | 'moving'
  | 'later'
  | 'resting'
  | 'hidden'

export type CurrentStatus = {
  kind: StatusKind
  expiresAt: number
  updatedAt: number
}

export type UserProfile = {
  uid: string
  displayName: string
  friendCode: string
  avatar: AvatarConfig
  currentStatus: CurrentStatus | null
  createdAt?: unknown
}

export type FriendEntry = {
  uid: string
  requestId: string
  createdAt?: unknown
}

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
  readAt: number | null
  createdAt?: { toMillis?: () => number }
}
