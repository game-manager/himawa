import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'

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
})
