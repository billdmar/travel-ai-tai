import { useEffect, useRef, useState } from 'react'
import { createShareLink, exportItinerary } from '../api/client'
import ErrorBanner from './ErrorBanner'

interface ExportShareButtonProps {
  itineraryId: string
}

type Busy = 'markdown' | 'pdf' | 'ics' | 'share' | null

// File extension per export format (the ICS calendar mirrors markdown/pdf).
const EXPORT_EXT: Record<'markdown' | 'pdf' | 'ics', string> = {
  markdown: 'md',
  pdf: 'pdf',
  ics: 'ics',
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Export / share controls for an itinerary. Exports Markdown or PDF via
 * exportItinerary (file download) and creates a public share link via
 * createShareLink, copying the resulting /share/:token URL to the clipboard
 * with a confirmation toast. Errors surface inline through ErrorBanner.
 */
export default function ExportShareButton({ itineraryId }: ExportShareButtonProps) {
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<unknown>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  function flashToast(message: string) {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }

  async function handleExport(format: 'markdown' | 'pdf' | 'ics') {
    if (busy) return
    setError(null)
    setBusy(format)
    try {
      const blob = await exportItinerary(itineraryId, format)
      triggerDownload(blob, `itinerary-${itineraryId}.${EXPORT_EXT[format]}`)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  async function handleShare() {
    if (busy) return
    setError(null)
    setBusy('share')
    try {
      const { token } = await createShareLink(itineraryId)
      const url = `${window.location.origin}/share/${token}`
      try {
        await navigator.clipboard.writeText(url)
        flashToast('Share link copied to clipboard.')
      } catch {
        // Clipboard may be blocked (insecure context / permissions): show the URL.
        flashToast(`Share link: ${url}`)
      }
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  const baseBtn =
    'inline-flex items-center gap-2 rounded-full border border-ink-line bg-canvas-raised px-4 py-2 text-sm font-medium text-ink-soft transition-colors duration-hover hover:bg-canvas-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-wait disabled:opacity-60'

  return (
    <div className="space-y-3">
      {error != null && (
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleExport('markdown')}
          disabled={busy !== null}
          aria-busy={busy === 'markdown'}
          className={baseBtn}
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
          {busy === 'markdown' ? 'Exporting…' : 'Markdown'}
        </button>

        <button
          type="button"
          onClick={() => handleExport('pdf')}
          disabled={busy !== null}
          aria-busy={busy === 'pdf'}
          className={baseBtn}
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
          {busy === 'pdf' ? 'Exporting…' : 'PDF'}
        </button>

        <button
          type="button"
          onClick={() => handleExport('ics')}
          disabled={busy !== null}
          aria-busy={busy === 'ics'}
          className={baseBtn}
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
            />
          </svg>
          {busy === 'ics' ? 'Exporting…' : 'Add to calendar (.ics)'}
        </button>

        <button
          type="button"
          onClick={handleShare}
          disabled={busy !== null}
          aria-busy={busy === 'share'}
          className="inline-flex items-center gap-2 rounded-full bg-accent-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors duration-hover hover:bg-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-wait disabled:opacity-60"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"
            />
          </svg>
          {busy === 'share' ? 'Creating link…' : 'Share link'}
        </button>
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-50 flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-xl border border-ink-line bg-canvas-raised px-4 py-3 shadow-lift motion-safe:animate-fadeIn"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-500 text-xs text-white">
            ✓
          </span>
          <span className="truncate text-sm font-medium text-ink">{toast}</span>
        </div>
      )}
    </div>
  )
}
