import { useEffect, useState } from 'react'

/**
 * Unobtrusive banner shown while the browser reports no network connectivity.
 *
 * Pairs with the PWA service worker (see register.ts / vite.config.ts): when a
 * user goes offline, cached itineraries and images are still served, and this
 * banner tells them they're looking at saved data rather than a live response.
 *
 * Listens to the `online`/`offline` window events and seeds initial state from
 * `navigator.onLine`. Renders nothing when online (and when `navigator` is
 * unavailable, e.g. SSR/test), so it's safe to mount unconditionally.
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState<boolean>(
    typeof navigator !== 'undefined' && navigator.onLine === false,
  )

  useEffect(() => {
    const goOnline = () => setOffline(false)
    const goOffline = () => setOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-accent-500 bg-ink px-4 py-2 text-center text-sm font-medium text-canvas shadow-lift"
    >
      You&rsquo;re offline &mdash; showing saved data.
    </div>
  )
}
