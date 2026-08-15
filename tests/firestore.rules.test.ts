import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'

const projectId = 'himawa-rules-test'
let testEnv: RulesTestEnvironment

const avatar = { skin: 'peach', hair: 'ink', outfit: 'tomato', background: 'cream' }

function profile(uid: string, friendCode: string) {
  return {
    uid,
    displayName: uid === 'alice' ? 'ありす' : 'ぼぶ',
    friendCode,
    avatar,
    currentStatus: null,
    createdAt: new Date(),
  }
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

beforeEach(async () => testEnv.clearFirestore())
afterAll(async () => testEnv.cleanup())

describe('HIMAWA Firestore rules', () => {
  it('keeps profiles private from strangers', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'alice'), profile('alice', 'ALICE2'))
    })

    await assertSucceeds(getDoc(doc(testEnv.authenticatedContext('alice').firestore(), 'users', 'alice')))
    await assertFails(getDoc(doc(testEnv.authenticatedContext('mallory').firestore(), 'users', 'alice')))
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'users', 'alice')))
  })

  it('accepts only optimized raster photos in avatars', async () => {
    const alice = testEnv.authenticatedContext('alice').firestore()
    const photoAvatar = { ...avatar, photoUrl: 'data:image/jpeg;base64,' + 'A'.repeat(120) }
    await assertSucceeds(setDoc(doc(alice, 'users', 'alice'), { ...profile('alice', 'ALICE2'), avatar: photoAvatar }))
    await assertSucceeds(setDoc(doc(alice, 'publicProfiles', 'alice'), {
      uid: 'alice', displayName: 'ありす', avatar: photoAvatar, discoverable: true,
    }))
    await assertFails(setDoc(doc(alice, 'publicProfiles', 'alice'), {
      uid: 'alice', displayName: 'ありす', avatar: { ...avatar, photoUrl: 'data:image/svg+xml;base64,' + 'A'.repeat(120) }, discoverable: true,
    }))
    await assertFails(setDoc(doc(alice, 'publicProfiles', 'alice'), {
      uid: 'alice', displayName: 'ありす', avatar: { ...avatar, photoUrl: 'data:image/jpeg;base64,' + 'A'.repeat(125001) }, discoverable: true,
    }))
  })

  it('lets only the owner record that the notification prompt was shown', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'alice'), profile('alice', 'ALICE2'))
    })

    await assertSucceeds(updateDoc(doc(testEnv.authenticatedContext('alice').firestore(), 'users', 'alice'), { pushPromptShownAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(testEnv.authenticatedContext('mallory').firestore(), 'users', 'alice'), { pushPromptShownAt: serverTimestamp() }))
  })

  it('allows exact code lookup but prevents code enumeration', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'codes', 'ALICE2'), { uid: 'alice', displayName: 'ありす', friendCode: 'ALICE2' })
    })
    const bob = testEnv.authenticatedContext('bob').firestore()
    await assertSucceeds(getDoc(doc(bob, 'codes', 'ALICE2')))
    await assertFails(getDocs(collection(bob, 'codes')))
  })

  it('creates a mutual friendship only after the receiver accepts', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const admin = context.firestore()
      await setDoc(doc(admin, 'users', 'alice'), profile('alice', 'ALICE2'))
      await setDoc(doc(admin, 'users', 'bob'), profile('bob', 'BOB222'))
      await setDoc(doc(admin, 'friendRequests', 'request-1'), {
        fromUid: 'alice', fromName: 'ありす', fromAvatar: avatar, toUid: 'bob', status: 'pending', createdAt: new Date(),
      })
    })

    const bob = testEnv.authenticatedContext('bob').firestore()
    const batch = writeBatch(bob)
    batch.update(doc(bob, 'friendRequests', 'request-1'), { status: 'accepted', respondedAt: serverTimestamp() })
    batch.set(doc(bob, 'users', 'alice', 'friends', 'bob'), { uid: 'bob', requestId: 'request-1', createdAt: serverTimestamp() })
    batch.set(doc(bob, 'users', 'bob', 'friends', 'alice'), { uid: 'alice', requestId: 'request-1', createdAt: serverTimestamp() })
    await assertSucceeds(batch.commit())

    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(getDoc(doc(alice, 'users', 'bob')))
  })

  it('immediately hides a profile after blocking', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const admin = context.firestore()
      await setDoc(doc(admin, 'users', 'alice'), profile('alice', 'ALICE2'))
      await setDoc(doc(admin, 'users', 'bob'), profile('bob', 'BOB222'))
      await setDoc(doc(admin, 'users', 'alice', 'friends', 'bob'), { uid: 'bob', requestId: 'request-1' })
      await setDoc(doc(admin, 'users', 'bob', 'friends', 'alice'), { uid: 'alice', requestId: 'request-1' })
    })

    const bob = testEnv.authenticatedContext('bob').firestore()
    await assertSucceeds(getDoc(doc(bob, 'users', 'alice')))
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(setDoc(doc(alice, 'users', 'alice', 'blocks', 'bob'), { uid: 'bob', createdAt: serverTimestamp() }))
    await assertFails(getDoc(doc(bob, 'users', 'alice')))
  })

  it('keeps every status share limited to friends', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const admin = context.firestore()
      await setDoc(doc(admin, 'users', 'alice'), profile('alice', 'ALICE2'))
      await setDoc(doc(admin, 'users', 'bob'), profile('bob', 'BOB222'))
      await setDoc(doc(admin, 'users', 'alice', 'friends', 'bob'), { uid: 'bob', requestId: 'request-1' })
      await setDoc(doc(admin, 'users', 'bob', 'friends', 'alice'), { uid: 'alice', requestId: 'request-1' })
      await setDoc(doc(admin, 'statusShares', 'alice'), {
        uid: 'alice', displayName: 'ありす', avatar, text: '放課後あそべる', emoji: '🌻',
        availability: 'free', activities: ['game'], visibility: 'friends', expiresAt: Date.now() + 60_000, updatedAt: Date.now(),
      })
    })

    const bob = testEnv.authenticatedContext('bob').firestore()
    const mallory = testEnv.authenticatedContext('mallory').firestore()
    await assertSucceeds(getDoc(doc(bob, 'statusShares', 'alice')))
    await assertFails(getDoc(doc(mallory, 'statusShares', 'alice')))

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const admin = context.firestore()
      await setDoc(doc(admin, 'users', 'alice', 'followers', 'mallory'), { uid: 'mallory' })
      await setDoc(doc(admin, 'statusShares', 'alice'), {
        uid: 'alice', displayName: 'ありす', avatar, text: 'みんなで話そう', emoji: '💬',
        visibility: 'followers', expiresAt: Date.now() + 60_000, updatedAt: Date.now(),
      })
    })
    await assertFails(getDoc(doc(mallory, 'statusShares', 'alice')))

    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(alice, 'statusShares', 'alice'), {
      uid: 'alice', displayName: 'ありす', avatar, text: 'みんなで話そう', emoji: '💬',
      visibility: 'public', expiresAt: Date.now() + 60_000, updatedAt: Date.now(),
    }))
  })

  it('accepts only sanitized music tracks on a status', async () => {
    const alice = testEnv.authenticatedContext('alice').firestore()
    const baseStatus = {
      uid: 'alice', displayName: 'ありす', avatar, text: 'この曲きいてる', emoji: '🟢',
      visibility: 'friends', expiresAt: Date.now() + 60_000, updatedAt: Date.now(),
    }
    const music = {
      provider: 'spotify', trackId: '11dFghVXANMlKmJXsNCbNl',
      url: 'https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl', title: 'Cut To The Feeling',
      thumbnailUrl: 'https://image-cdn-ak.spotifycdn.com/image/example',
    }

    await assertSucceeds(setDoc(doc(alice, 'statusShares', 'alice'), { ...baseStatus, music }))
    await assertFails(setDoc(doc(alice, 'statusShares', 'alice'), { ...baseStatus, music: { ...music, url: 'https://evil.example/track' } }))

    const appleMusic = {
      provider: 'apple', trackId: '1234567890', title: '夜に駆ける', artistName: 'YOASOBI',
      url: 'https://music.apple.com/jp/album/example/123?i=1234567890',
      thumbnailUrl: 'https://is1-ssl.mzstatic.com/image/thumb/example/100x100bb.jpg',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/example.m4a',
    }
    await assertSucceeds(setDoc(doc(alice, 'statusShares', 'alice'), { ...baseStatus, music: appleMusic }))
    await assertFails(setDoc(doc(alice, 'statusShares', 'alice'), { ...baseStatus, music: { ...appleMusic, previewUrl: 'https://evil.example/preview.m4a' } }))
  })

  it('allows short invitations but rejects oversized invitation text', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const admin = context.firestore()
      await setDoc(doc(admin, 'users', 'alice'), profile('alice', 'ALICE2'))
      await setDoc(doc(admin, 'users', 'bob'), profile('bob', 'BOB222'))
      await setDoc(doc(admin, 'users', 'alice', 'friends', 'bob'), { uid: 'bob', requestId: 'request-1' })
      await setDoc(doc(admin, 'users', 'bob', 'friends', 'alice'), { uid: 'alice', requestId: 'request-1' })
    })
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(setDoc(doc(alice, 'pokes', 'invite-1'), { fromUid: 'alice', fromName: 'ありす', toUid: 'bob', kind: 'game', activity: 'game', message: 'ゲームしよ', readAt: null }))
    await assertFails(setDoc(doc(alice, 'pokes', 'invite-2'), { fromUid: 'alice', fromName: 'ありす', toUid: 'bob', kind: 'game', message: 'あ'.repeat(61), readAt: null }))
  })

  it('allows DMs only while both users are friends', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const admin = context.firestore()
      await setDoc(doc(admin, 'users', 'alice'), profile('alice', 'ALICE2'))
      await setDoc(doc(admin, 'users', 'bob'), profile('bob', 'BOB222'))
      await setDoc(doc(admin, 'users', 'alice', 'friends', 'bob'), { uid: 'bob', requestId: 'request-1' })
      await setDoc(doc(admin, 'users', 'bob', 'friends', 'alice'), { uid: 'alice', requestId: 'request-1' })
      await setDoc(doc(admin, 'conversations', 'alice_bob'), {
        participants: ['bob', 'alice'], participantNames: { alice: 'ありす', bob: 'ぼぶ' },
        participantAvatars: { alice: avatar, bob: avatar }, lastMessage: '', updatedAt: new Date(),
      })
    })

    const bob = testEnv.authenticatedContext('bob').firestore()
    const alice = testEnv.authenticatedContext('alice').firestore()
    const mallory = testEnv.authenticatedContext('mallory').firestore()
    // Opening an existing conversation must not rewrite the participant order.
    await assertSucceeds(getDoc(doc(alice, 'conversations', 'alice_bob')))
    await assertFails(setDoc(doc(alice, 'conversations', 'alice_bob'), {
      participants: ['alice', 'bob'], participantNames: { alice: 'ありす', bob: 'ぼぶ' },
      participantAvatars: { alice: avatar, bob: avatar }, lastMessage: '', updatedAt: serverTimestamp(),
    }, { merge: true }))
    await assertSucceeds(getDoc(doc(bob, 'conversations', 'alice_bob')))
    await assertSucceeds(getDocs(query(collection(bob, 'conversations'), where('participants', 'array-contains', 'bob'))))
    await assertFails(getDoc(doc(mallory, 'conversations', 'alice_bob')))
    await assertSucceeds(setDoc(doc(bob, 'conversations', 'alice_bob', 'messages', 'm1'), { senderUid: 'bob', text: 'こんにちは', createdAt: new Date() }))
    await assertSucceeds(getDocs(collection(bob, 'conversations', 'alice_bob', 'messages')))
    const sendBatch = writeBatch(bob)
    sendBatch.set(doc(bob, 'conversations', 'alice_bob', 'messages', 'm3'), { senderUid: 'bob', text: '今から遊ぼ', createdAt: serverTimestamp() })
    sendBatch.set(doc(bob, 'conversations', 'alice_bob'), { lastMessage: '今から遊ぼ', updatedAt: serverTimestamp() }, { merge: true })
    await assertSucceeds(sendBatch.commit())
    await assertFails(setDoc(doc(mallory, 'conversations', 'alice_bob', 'messages', 'm2'), { senderUid: 'mallory', text: '読めない', createdAt: new Date() }))
  })

  it('keeps group statuses inside invite-only groups', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const admin = context.firestore()
      await setDoc(doc(admin, 'groups', 'classroom'), { name: '放課後組', ownerUid: 'alice', inviteCode: 'SUN222', createdAt: new Date() })
      await setDoc(doc(admin, 'groups', 'classroom', 'members', 'alice'), { uid: 'alice' })
      await setDoc(doc(admin, 'groups', 'classroom', 'members', 'bob'), { uid: 'bob' })
      await setDoc(doc(admin, 'groups', 'classroom', 'statuses', 'alice'), {
        uid: 'alice', displayName: 'ありす', avatar, text: '集合できる人？', emoji: '🌻',
        visibility: 'groups', expiresAt: Date.now() + 60_000, updatedAt: Date.now(), groupIds: ['classroom'],
      })
    })

    await assertSucceeds(getDocs(collection(testEnv.authenticatedContext('bob').firestore(), 'groups', 'classroom', 'statuses')))
    await assertFails(getDocs(collection(testEnv.authenticatedContext('mallory').firestore(), 'groups', 'classroom', 'statuses')))
  })

  it('allows only registered admins to moderate content and users', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const admin = context.firestore()
      await setDoc(doc(admin, 'admins', 'alice'), { uid: 'alice', createdAt: new Date() })
      await setDoc(doc(admin, 'users', 'alice'), profile('alice', 'ALICE2'))
      await setDoc(doc(admin, 'users', 'bob'), profile('bob', 'BOB222'))
      await setDoc(doc(admin, 'publicProfiles', 'bob'), { uid: 'bob', displayName: 'ぼぶ', avatar, discoverable: false })
      await setDoc(doc(admin, 'notes', 'note-1'), { authorUid: 'bob', authorName: 'ぼぶ', authorAvatar: avatar, text: 'テスト投稿', expiresAt: Date.now() + 60_000, createdAt: new Date() })
      await setDoc(doc(admin, 'reports', 'report-1'), { reporterUid: 'mallory', targetUid: 'bob', reason: '迷惑行為', createdAt: new Date() })
    })

    const alice = testEnv.authenticatedContext('alice').firestore()
    const mallory = testEnv.authenticatedContext('mallory').firestore()
    await assertSucceeds(getDocs(collection(alice, 'publicProfiles')))
    await assertFails(getDocs(collection(mallory, 'publicProfiles')))
    await assertSucceeds(deleteDoc(doc(alice, 'notes', 'note-1')))
    await assertSucceeds(updateDoc(doc(alice, 'reports', 'report-1'), { status: 'resolved', reviewedAt: serverTimestamp(), reviewedBy: 'alice' }))
    await assertSucceeds(setDoc(doc(alice, 'moderation', 'bob'), { status: 'suspended', reason: '安全確認', updatedAt: serverTimestamp(), updatedBy: 'alice' }))
    await assertFails(setDoc(doc(mallory, 'moderation', 'bob'), { status: 'suspended', reason: '不正操作', updatedAt: serverTimestamp(), updatedBy: 'mallory' }))
    await assertSucceeds(setDoc(doc(alice, 'admins', 'bob'), { uid: 'bob', displayName: 'ぼぶ', createdAt: serverTimestamp(), createdBy: 'alice' }))
    await assertFails(setDoc(doc(mallory, 'admins', 'mallory'), { uid: 'mallory', displayName: 'まりー', createdAt: serverTimestamp(), createdBy: 'mallory' }))
    await assertSucceeds(deleteDoc(doc(alice, 'admins', 'bob')))
    await assertFails(deleteDoc(doc(alice, 'admins', 'alice')))
  })

  it('blocks suspended users from normal app data', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const admin = context.firestore()
      await setDoc(doc(admin, 'users', 'bob'), profile('bob', 'BOB222'))
      await setDoc(doc(admin, 'moderation', 'bob'), { status: 'suspended', reason: '安全確認', updatedBy: 'alice' })
    })
    const bob = testEnv.authenticatedContext('bob').firestore()
    await assertSucceeds(getDoc(doc(bob, 'moderation', 'bob')))
    await assertFails(getDoc(doc(bob, 'users', 'bob')))
    await assertFails(setDoc(doc(bob, 'notes', 'blocked-note'), { authorUid: 'bob', authorName: 'ぼぶ', authorAvatar: avatar, text: '投稿できない', expiresAt: Date.now() + 60_000, createdAt: new Date() }))
  })
})
