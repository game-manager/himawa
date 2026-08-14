export type PushSubscriptionData = {
  endpoint: string
  expirationTime: number | null
  keys: { auth: string; p256dh: string }
}

export function decodeFirestoreValue(value: Record<string, unknown> | undefined): unknown {
  if (!value) return undefined
  if ('stringValue' in value) return value.stringValue
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return value.doubleValue
  if ('timestampValue' in value) return value.timestampValue
  if ('nullValue' in value) return null
  if ('arrayValue' in value) {
    const values = (value.arrayValue as { values?: Array<Record<string, unknown>> }).values ?? []
    return values.map((item) => decodeFirestoreValue(item))
  }
  if ('mapValue' in value) return decodeFirestoreFields((value.mapValue as { fields?: Record<string, Record<string, unknown>> }).fields ?? {})
  return undefined
}

export function decodeFirestoreFields(fields: Record<string, Record<string, unknown>>) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]))
}

export function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,320}$/.test(value)
}

export function validUid(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{6,128}$/.test(value)
}

export function validSubscription(value: unknown): value is PushSubscriptionData {
  if (!value || typeof value !== 'object') return false
  const subscription = value as Partial<PushSubscriptionData>
  return typeof subscription.endpoint === 'string'
    && subscription.endpoint.startsWith('https://')
    && typeof subscription.keys?.auth === 'string'
    && subscription.keys.auth.length > 0
    && typeof subscription.keys?.p256dh === 'string'
    && subscription.keys.p256dh.length > 0
}

export function appUrlForOrigin(value: unknown, allowedOrigins: string) {
  if (typeof value !== 'string') return null
  try {
    const candidate = new URL(value)
    const allowed = allowedOrigins.split(',').map((item) => item.trim())
    if (!allowed.includes(candidate.origin)) return null
    candidate.search = ''
    candidate.hash = ''
    return candidate.href
  } catch {
    return null
  }
}
