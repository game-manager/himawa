import { DurableObject } from 'cloudflare:workers'
import webpush from 'web-push'
import { appUrlForOrigin, decodeFirestoreFields, validId, validSubscription, validUid, type PushSubscriptionData } from './validation'

type Env = {
  PUSH_USERS: DurableObjectNamespace<PushUser>
  FIREBASE_API_KEY: string
  FIREBASE_PROJECT_ID: string
  ALLOWED_ORIGINS: string
  APP_URL: string
  VAPID_SUBJECT: string
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
}

type StoredDevice = { subscription: PushSubscriptionData; appUrl: string }

type NotifyInput =
  | { type: 'dm'; targetUid: string; conversationId: string; messageId: string }
  | { type: 'invite'; targetUid: string; pokeId: string }
  | { type: 'friend_request'; targetUid: string; requestId: string }

type PushPayload = { title: string; body: string; url: string; tag: string }

function responseJson(value: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } })
}

async function authenticatedUid(request: Request, env: Env) {
  const authorization = request.headers.get('authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) throw new Response('Unauthorized', { status: 401 })
  const idToken = authorization.slice(7)
  const result = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })
  if (!result.ok) throw new Response('Unauthorized', { status: 401 })
  const data = await result.json() as { users?: Array<{ localId?: string }> }
  const uid = data.users?.[0]?.localId
  if (!uid) throw new Response('Unauthorized', { status: 401 })
  return { uid, idToken }
}

async function readFirestoreDocument(env: Env, path: string, idToken: string) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const result = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${encodedPath}`, {
    headers: { authorization: `Bearer ${idToken}` },
  })
  if (!result.ok) throw new Response('Forbidden', { status: result.status === 404 ? 404 : 403 })
  const document = await result.json() as { fields?: Record<string, Record<string, unknown>> }
  return decodeFirestoreFields(document.fields ?? {})
}

async function senderName(env: Env, uid: string, idToken: string) {
  const user = await readFirestoreDocument(env, `users/${uid}`, idToken).catch(() => null)
  return typeof user?.displayName === 'string' ? user.displayName : '友達'
}

async function validateNotification(input: NotifyInput, uid: string, idToken: string, env: Env) {
  if (!validUid(input.targetUid) || input.targetUid === uid) throw new Response('Invalid target', { status: 400 })
  const name = await senderName(env, uid, idToken)
  if (input.type === 'invite') {
    if (!validId(input.pokeId)) throw new Response('Invalid event', { status: 400 })
    const poke = await readFirestoreDocument(env, `pokes/${input.pokeId}`, idToken)
    if (poke.fromUid !== uid || poke.toUid !== input.targetUid) throw new Response('Forbidden', { status: 403 })
    return {
      key: `invite:${input.pokeId}`,
      payload: { title: `${name}さんからのお誘い`, body: typeof poke.message === 'string' ? `「${poke.message}」` : '遊びのお誘いが届きました', url: `${env.APP_URL}?open=notifications`, tag: `invite-${input.pokeId}` },
    }
  }
  if (input.type === 'friend_request') {
    if (!validId(input.requestId)) throw new Response('Invalid event', { status: 400 })
    const friendRequest = await readFirestoreDocument(env, `friendRequests/${input.requestId}`, idToken)
    if (friendRequest.fromUid !== uid || friendRequest.toUid !== input.targetUid || friendRequest.status !== 'pending') throw new Response('Forbidden', { status: 403 })
    return {
      key: `friend:${input.requestId}`,
      payload: { title: `${name}さんから友達申請`, body: 'HIMAWAで友達になりたいみたい', url: `${env.APP_URL}?open=notifications`, tag: `friend-${input.requestId}` },
    }
  }
  if (!validId(input.conversationId) || !validId(input.messageId)) throw new Response('Invalid event', { status: 400 })
  const conversation = await readFirestoreDocument(env, `conversations/${input.conversationId}`, idToken)
  const participants = Array.isArray(conversation.participants) ? conversation.participants : []
  if (participants.length !== 2 || !participants.includes(uid) || !participants.includes(input.targetUid)) throw new Response('Forbidden', { status: 403 })
  const message = await readFirestoreDocument(env, `conversations/${input.conversationId}/messages/${input.messageId}`, idToken)
  if (message.senderUid !== uid) throw new Response('Forbidden', { status: 403 })
  return {
    key: `dm:${input.conversationId}:${input.messageId}`,
    payload: { title: `${name}さんからDM`, body: '新しいメッセージが届きました', url: `${env.APP_URL}?open=dm&conversation=${encodeURIComponent(input.conversationId)}`, tag: `dm-${input.conversationId}` },
  }
}

export class PushUser extends DurableObject<Env> {
  async fetch(request: Request) {
    const url = new URL(request.url)
    if (request.method !== 'POST') return responseJson({ error: 'Method not allowed' }, 405)
    if (url.pathname === '/subscribe') {
      const body = await request.json() as { uid?: string; deviceId?: string; subscription?: PushSubscriptionData; appUrl?: string }
      const appUrl = appUrlForOrigin(body.appUrl, this.env.ALLOWED_ORIGINS)
      if (!validUid(body.uid) || !validId(body.deviceId) || !validSubscription(body.subscription) || !appUrl) return responseJson({ error: 'Invalid subscription' }, 400)
      const devices = await this.ctx.storage.list<StoredDevice>({ prefix: 'device:' })
      await Promise.all([...devices.entries()]
        .filter(([key, device]) => key.endsWith(`:${body.deviceId}`) || device.subscription.endpoint === body.subscription?.endpoint)
        .map(([key]) => this.ctx.storage.delete(key)))
      await this.ctx.storage.put(`device:${body.uid}:${body.deviceId}`, { subscription: body.subscription, appUrl } satisfies StoredDevice)
      return responseJson({ ok: true })
    }
    if (url.pathname === '/unsubscribe') {
      const body = await request.json() as { uid?: string; deviceId?: string }
      if (validUid(body.uid) && validId(body.deviceId)) await this.ctx.storage.delete(`device:${body.uid}:${body.deviceId}`)
      return responseJson({ ok: true })
    }
    if (url.pathname === '/notify') {
      const body = await request.json() as { key: string; senderUid: string; targetUid: string; payload: PushPayload }
      if (!validUid(body.targetUid)) return responseJson({ error: 'Invalid target' }, 400)
      if (await this.ctx.storage.get(`sent:${body.key}`)) return responseJson({ ok: true, duplicate: true, delivered: 0 })
      const minute = Math.floor(Date.now() / 60_000)
      const rateKey = `rate:${body.senderUid}:${minute}`
      const count = (await this.ctx.storage.get<number>(rateKey)) ?? 0
      if (count >= 8) return responseJson({ error: 'Too many notifications' }, 429)
      await this.ctx.storage.put(rateKey, count + 1, { expirationTtl: 120 })
      await this.ctx.storage.put(`sent:${body.key}`, true, { expirationTtl: 86_400 })

      webpush.setVapidDetails(this.env.VAPID_SUBJECT, this.env.VAPID_PUBLIC_KEY, this.env.VAPID_PRIVATE_KEY)
      const subscriptions = await this.ctx.storage.list<StoredDevice>({ prefix: `device:${body.targetUid}:` })
      let delivered = 0
      await Promise.all([...subscriptions.entries()].map(async ([key, device]) => {
        try {
          const route = new URL(body.payload.url).search
          const payload = { ...body.payload, url: new URL(route, device.appUrl).href }
          await webpush.sendNotification(device.subscription, JSON.stringify(payload), { TTL: 300 })
          delivered += 1
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode
          if (statusCode === 404 || statusCode === 410) await this.ctx.storage.delete(key)
        }
      }))
      return responseJson({ ok: true, delivered })
    }
    return responseJson({ error: 'Not found' }, 404)
  }
}

function corsHeaders(origin: string) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const origin = request.headers.get('origin') ?? ''
    const allowed = env.ALLOWED_ORIGINS.split(',').map((item) => item.trim())
    if (!allowed.includes(origin)) return responseJson({ error: 'Origin not allowed' }, 403)
    const cors = corsHeaders(origin)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') return responseJson({ error: 'Method not allowed' }, 405, cors)
    try {
      const { uid, idToken } = await authenticatedUid(request, env)
      const url = new URL(request.url)
      if (url.pathname === '/subscribe' || url.pathname === '/unsubscribe') {
        const target = env.PUSH_USERS.get(env.PUSH_USERS.idFromName('registry'))
        const body = await request.json() as Record<string, unknown>
        const result = await target.fetch(`https://push.internal${url.pathname}`, { method: 'POST', body: JSON.stringify({ ...body, uid }) })
        return responseJson(await result.json(), result.status, cors)
      }
      if (url.pathname === '/notify') {
        const input = await request.json() as NotifyInput
        const notification = await validateNotification(input, uid, idToken, env)
        const target = env.PUSH_USERS.get(env.PUSH_USERS.idFromName('registry'))
        const result = await target.fetch('https://push.internal/notify', { method: 'POST', body: JSON.stringify({ ...notification, senderUid: uid, targetUid: input.targetUid }) })
        return responseJson(await result.json(), result.status, cors)
      }
      return responseJson({ error: 'Not found' }, 404, cors)
    } catch (error) {
      if (error instanceof Response) return responseJson({ error: await error.text() }, error.status, cors)
      return responseJson({ error: 'Notification service error' }, 500, cors)
    }
  },
} satisfies ExportedHandler<Env>
