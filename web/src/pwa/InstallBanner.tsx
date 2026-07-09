import { useEffect, useState } from 'react'
import { useInstallPrompt } from './useInstallPrompt'

/**
 * A fixed-bottom banner prompting the user to install the PWA.
 *
 * - Only renders when the browser has fired `beforeinstallprompt` AND the user
 *   has not previously dismissed it AND the app is not already in standalone.
 * - Waits 30 seconds after mount before becoming visible so it does not flash
 *   on initial page load or distract from the primary experience.
 */
export default function InstallBanner() {
  const { canInstall, promptInstall, dismiss } = useInstallPrompt()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!canInstall) return
    const id = setTimeout(() => setVisible(true), 30_000)
    return () => clearTimeout(id)
  }, [canInstall])

  if (!canInstall || !visible) return null

  return (
    <div
      role="banner"
      aria-label="Install application"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-line bg-canvas-raised px-4 py-3"
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">
          Install Travel&nbsp;AI for offline access
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void promptInstall()}
            className="inline-flex items-center justify-center rounded-full bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600"
          >
            Install
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-canvas-sunken hover:text-ink"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      </div>
    </div>
  )
}
