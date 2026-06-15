import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'

interface ErrorBannerProps {
  error: unknown
  onDismiss?: () => void
  onRetry?: () => void
}

interface Parsed {
  tone: 'red' | 'amber' | 'orange'
  title: string
  message: string
}

function fieldDetails(body: unknown): string[] {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as Record<string, unknown>).detail
    if (Array.isArray(detail)) {
      return detail
        .map((d) => {
          if (d && typeof d === 'object' && 'msg' in d) {
            const loc =
              'loc' in d && Array.isArray((d as Record<string, unknown>).loc)
                ? ((d as Record<string, unknown>).loc as unknown[]).slice(-1).join('.')
                : ''
            return loc ? `${loc}: ${(d as Record<string, unknown>).msg}` : String((d as Record<string, unknown>).msg)
          }
          return typeof d === 'string' ? d : JSON.stringify(d)
        })
        .filter(Boolean)
    }
    if (typeof detail === 'string') return [detail]
  }
  return []
}

function classify(error: unknown): Parsed {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 0:
        return {
          tone: 'red',
          title: 'Network error',
          message:
            'Could not reach the server. Check that the API is running and your connection is active.',
        }
      case 422: {
        const details = fieldDetails(error.body)
        return {
          tone: 'amber',
          title: 'Please fix your preferences',
          message:
            details.length > 0
              ? details.join(' • ')
              : 'Some of the values you entered are invalid.',
        }
      }
      case 429:
        return {
          tone: 'orange',
          title: 'Too many requests',
          message: 'You have hit the rate limit. Please wait a moment before trying again.',
        }
      case 503:
        return {
          tone: 'orange',
          title: 'Itinerary service unavailable',
          message:
            'The itinerary generator is temporarily unavailable. Please try again shortly.',
        }
      case 502:
        return {
          tone: 'red',
          title: 'Generation failed',
          message: 'The itinerary could not be parsed. Please try again.',
        }
      default:
        return {
          tone: 'red',
          title: `Error ${error.status}`,
          message: 'Something went wrong while contacting the server.',
        }
    }
  }
  return {
    tone: 'red',
    title: 'Unexpected error',
    message: error instanceof Error ? error.message : 'Something went wrong.',
  }
}

const toneClasses: Record<Parsed['tone'], string> = {
  red: 'border-red-300 bg-red-50 text-red-800',
  amber: 'border-amber-300 bg-amber-50 text-amber-800',
  orange: 'border-orange-300 bg-orange-50 text-orange-800',
}

export default function ErrorBanner({ error, onDismiss, onRetry }: ErrorBannerProps) {
  const parsed = classify(error)
  const initialCountdown =
    error instanceof ApiError && error.status === 429 ? error.retryAfterSeconds ?? 60 : null
  const [countdown, setCountdown] = useState<number | null>(initialCountdown)

  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  const retryDisabled = countdown !== null && countdown > 0

  return (
    <div
      role="alert"
      className={`mx-auto max-w-4xl rounded-lg border p-4 shadow-frame ${toneClasses[parsed.tone]}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">{parsed.title}</p>
          <p className="mt-1 text-sm">{parsed.message}</p>
          {countdown !== null && countdown > 0 && (
            <p className="mt-1 text-sm font-medium">
              You can retry in {countdown}s.
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={retryDisabled}
              className="rounded-md bg-canvas-raised/70 px-3 py-1 text-sm font-medium hover:bg-canvas-raised disabled:cursor-not-allowed disabled:opacity-50"
            >
              Retry
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="rounded-md px-2 py-1 text-sm font-medium hover:bg-canvas-raised/50"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
