import type { User } from 'firebase/auth'

export type PushState = 'unconfigured' | 'unsupported' | 'default' | 'denied' | 'granted' | 'loading'

export type PushEventInput =
  | { type: 'dm'; targetUid: string; conversationId: string; messageId: string }
  | { type: 'invite'; targetUid: string; pokeId: string }
  | { type: 'friend_request'; targetUid: string; requestId: string }

const workerUrl = (import.meta.env.VITE_PUSH_WORKER_URL ?? 'https://himawa-push.himawa.workers.dev').replace(/\/$/, '')
const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? 'BF5T_nGmT-7M-WLwXrYOxlB8fnWBxxT1Xa1vq-Nso4-EC0Z2HsIhNNL9gWd-zwDWS1PiLQFXUUa-4Wgt2kOZc-k'
const deviceStorageKey = 'himawa-push-device-id'

function appUrl() {
  return new URL(import.meta.env.BASE_URL, window.location.href).href
}

function configured() {
  return workerUrl.startsWith('https://') && vapidPublicKey.length > 40 && !vapidPublicKey.startsWith('replace-')
}

function supported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function applicationServerKey(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const bytes = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0))
}

function deviceId() {
  const existing = localStorage.getItem(deviceStorageKey)
  if (existing) return existing
  const created = crypto.randomUUID()
  localStorage.setItem(deviceStorageKey, created)
  return created
}

async function callWorker(user: User, path: string, body: unknown) {
  const token = await user.getIdToken()
  const result = await fetch(`${workerUrl}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!result.ok) throw new Error(`PUSH_${result.status}`)
  return result
}

export async function currentPushState(): Promise<PushState> {
  if (!configured()) return 'unconfigured'
  if (!supported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'default'
  const registration = await navigator.serviceWorker.ready
  return await registration.pushManager.getSubscription() ? 'granted' : 'default'
}

export async function enablePushNotifications(user: User) {
  if (!configured() || !supported()) throw new Error('PUSH_UNAVAILABLE')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'PUSH_DENIED' : 'PUSH_NOT_GRANTED')
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(vapidPublicKey),
  })
  await callWorker(user, '/subscribe', { deviceId: deviceId(), appUrl: appUrl(), subscription: subscription.toJSON() })
}

export async function disablePushNotifications(user: User) {
  if (!configured() || !supported()) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  await callWorker(user, '/unsubscribe', { deviceId: deviceId() }).catch(() => undefined)
  await subscription?.unsubscribe()
}

export async function sendPushEvent(user: User, event: PushEventInput) {
  if (!configured()) return false
  return callWorker(user, '/notify', event).then(() => true).catch(() => false)
}
