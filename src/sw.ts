/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> }

type PushPayload = { title?: string; body?: string; url?: string; tag?: string }

precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))
cleanupOutdatedCaches()
self.skipWaiting()
clientsClaim()

self.addEventListener('push', (event) => {
  let payload: PushPayload = {}
  try { payload = event.data?.json() as PushPayload ?? {} } catch { payload = { body: event.data?.text() } }
  event.waitUntil(self.registration.showNotification(payload.title ?? 'HIMAWA', {
    body: payload.body ?? '新しいお知らせが届きました',
    icon: new URL('favicon.svg', self.registration.scope).href,
    badge: new URL('favicon.svg', self.registration.scope).href,
    tag: payload.tag ?? 'himawa-notification',
    data: { url: payload.url ?? self.registration.scope },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = new URL((event.notification.data as { url?: string } | undefined)?.url ?? self.registration.scope, self.registration.scope).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find((client) => new URL(client.url).origin === new URL(targetUrl).origin)
    if (existing) {
      await existing.navigate(targetUrl)
      return existing.focus()
    }
    return self.clients.openWindow(targetUrl)
  })())
})
