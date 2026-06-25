import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { ItineraryResponse, TravelPreferences } from '../types/itinerary'
import { getItinerary, streamItinerary } from '../api/client'
import { useItinerary } from '../hooks/useItinerary'
import { Container, Reveal, Section } from '../components/ui'
import ItineraryView from '../components/ItineraryView'
import ErrorBanner from '../components/ErrorBanner'
import LoadingSkeleton from '../components/LoadingSkeleton'

interface ItineraryLocationState {
  /** When present, generate live via the streaming endpoint instead of GET-by-id. */
  prefs?: TravelPreferences
}

/**
 * Live token-by-token generation reveal. Calls streamItinerary and surfaces a
 * trickle of the model's output as it arrives, so a long generation feels alive
 * rather than a blank spinner. Resolves to the final ItineraryResponse.
 */
function StreamingReveal({
  prefs,
  onDone,
  onError,
}: {
  prefs: TravelPreferences
  onDone: (it: ItineraryResponse) => void
  onError: (err: unknown) => void
}) {
  const [text, setText] = useState('')
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    let active = true
    streamItinerary(prefs, (chunk) => {
      if (!active) return
      // The final chunk is the full itinerary JSON; don't dump it as prose.
      const looksLikeJson = chunk.trimStart().startsWith('{')
      if (looksLikeJson) return
      setText((prev) => (prev ? `${prev} ${chunk}` : chunk))
    })
      .then((it) => {
        if (active) onDone(it)
      })
      .catch((err) => {
        if (active) onError(err)
      })
    return () => {
      active = false
    }
    // Intentionally run once for the given prefs; onDone/onError are stable enough
    // for this mount-scoped stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="mx-auto max-w-2xl space-y-6 text-center">
      <Reveal>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent-700">
          Composing your trip
        </p>
        <h1 className="mt-3 font-serif text-4xl font-medium leading-tight tracking-tight text-ink sm:text-5xl">
          {prefs.destination}
        </h1>
      </Reveal>

      <div
        aria-live="polite"
        aria-busy="true"
        className="min-h-24 rounded-2xl border border-ink-line bg-canvas-raised p-6 text-left text-ink-soft shadow-frame"
      >
        {text ? (
          <p className="leading-relaxed">
            {text}
            <span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-accent-500 motion-safe:animate-pulse" />
          </p>
        ) : (
          <p className="flex items-center gap-2 text-ink-faint">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-400 motion-reduce:animate-none" />
            Gathering ideas for {prefs.destination}…
          </p>
        )}
      </div>
    </div>
  )
}

export default function ItineraryPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const streamPrefs = (location.state as ItineraryLocationState | null)?.prefs ?? null

  // Stream first if prefs were passed; otherwise fetch the existing itinerary
  // by id through the shared lifecycle hook (disabled while streaming, since the
  // stream is then the source of truth and injects its result via setItinerary).
  const [streaming, setStreaming] = useState(!!streamPrefs)
  const [streamError, setStreamError] = useState<unknown>(null)

  const fetcher = useCallback(() => getItinerary(id ?? ''), [id])
  const {
    itinerary,
    loading,
    error: fetchError,
    reload: load,
    dismissError: dismissFetchError,
    setItinerary,
  } = useItinerary(fetcher, !streamPrefs)

  // While streaming, the live stream owns errors; otherwise the fetch does.
  const error = streamPrefs ? streamError : fetchError

  const handleStreamDone = useCallback(
    (it: ItineraryResponse) => {
      setItinerary(it)
      setStreaming(false)
      // Replace history so a refresh re-fetches by id (no re-generation).
      navigate(`/itinerary/${encodeURIComponent(it.id)}`, { replace: true })
    },
    [navigate, setItinerary],
  )

  const handleStreamError = useCallback((err: unknown) => {
    setStreamError(err)
    setStreaming(false)
  }, [])

  const dismissError = useCallback(() => {
    if (streamPrefs) setStreamError(null)
    else dismissFetchError()
  }, [streamPrefs, dismissFetchError])

  return (
    <Container>
      <Section>
        {streaming && streamPrefs ? (
          <StreamingReveal
            prefs={streamPrefs}
            onDone={handleStreamDone}
            onError={handleStreamError}
          />
        ) : loading ? (
          <LoadingSkeleton />
        ) : error != null ? (
          <div className="mx-auto max-w-2xl space-y-4">
            <ErrorBanner
              error={error}
              onDismiss={dismissError}
              onRetry={streamPrefs ? undefined : load}
            />
            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate('/discover')}
                className="rounded-full border border-ink-line bg-canvas-raised px-6 py-2.5 text-sm font-medium text-ink-soft transition-colors duration-hover hover:bg-canvas-sunken hover:text-ink focus-visible:outline-none"
              >
                Plan a trip
              </button>
            </div>
          </div>
        ) : itinerary ? (
          <ItineraryView
            itinerary={itinerary}
            onReset={() => navigate('/discover')}
            onViewSaved={() => navigate('/saved')}
            onAdjust={() =>
              // Open the planning form in "adjust mode" seeded from this trip:
              // submitting there calls regenerate (a new trip from this source).
              navigate(`/plan/${encodeURIComponent(itinerary.preferences.destination)}`, {
                state: {
                  adjust: { sourceId: itinerary.id, preferences: itinerary.preferences },
                },
              })
            }
          />
        ) : null}
      </Section>
    </Container>
  )
}
