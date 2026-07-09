import { useEffect, useState } from 'react'

/**
 * The browser's BeforeInstallPromptEvent — not yet in lib.dom.d.ts, so we
 * declare the subset we use.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

const DISMISSED_KEY = 'tai.installDismissed'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/**
 * Hook that captures the browser's install prompt event and exposes a
 * declarative API for showing / triggering / dismissing a PWA install banner.
 */
export function useInstallPrompt() {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(DISMISSED_KEY) === '1'
  })

  useEffect(() => {
    const handler = (e: Event) => {
      // Prevent the mini-infobar on mobile
      e.preventDefault()
      setDeferredEvent(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const canInstall = deferredEvent !== null && !dismissed && !isStandalone()

  const promptInstall = async (): Promise<void> => {
    if (!deferredEvent) return
    await deferredEvent.prompt()
    setDeferredEvent(null)
  }

  const dismiss = (): void => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
    setDeferredEvent(null)
  }

  return { canInstall, promptInstall, dismiss }
}
