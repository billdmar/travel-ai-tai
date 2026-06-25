import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { ItineraryResponse, TravelPreferences } from '../types/itinerary'
import { getItinerary, streamItinerary } from '../api/client'
import { useItinerary } from '../hooks/useItinerary'
import { Container, Reveal, Section, usePrefersReducedMotion } from '../components/ui'
import { durationSeconds, easeLux } from '../components/ui/motionTokens'
import ItineraryView from '../components/ItineraryView'
import ErrorBanner from '../components/ErrorBanner'
import LoadingSkeleton from '../components/LoadingSkeleton'

/**
 * Human-readable stages the progress stepper walks through during generation.
 * We cannot know the true percentage (the SSE stream sends prose chunks then a
 * single terminal JSON chunk), so the bar is TIME-STAGED: it advances on a
 * fixed cadence and eases toward a cap, never claiming false precision.
 */
const PROGRESS_STAGES = ['Gathering ideas', 'Mapping your days', 'Pricing & polishing'] as const
/** How long each stage holds before the label advances (ms). */
const STAGE_INTERVAL_MS = 4500
/** The bar eases toward this fraction and CAPS until onDone fires (then 100%). */
const PROGRESS_CAP = 0.9

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
  const reduced = usePrefersReducedMotion()
  const [text, setText] = useState('')
  // Index into PROGRESS_STAGES, advanced by a setInterval-driven stepper. Caps
  // at the last stage; `done` separately drives the bar to 100% on completion.
  const [stage, setStage] = useState(0)
  const [done, setDone] = useState(false)
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
        if (active) {
          // Snap the bar to 100% before handing control to the parent so the
          // unmounting view reads "complete" rather than frozen at the cap.
          setDone(true)
          onDone(it)
        }
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

  // Time-staged stepper: advance the stage label on a fixed cadence, stopping
  // at the final stage. Independent of the stream so the label moves even
  // before the first prose chunk arrives. Cleaned up on unmount.
  useEffect(() => {
    const timer = setInterval(() => {
      setStage((s) => Math.min(s + 1, PROGRESS_STAGES.length - 1))
    }, STAGE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  // Fraction the bar fills: each stage adds an equal slice up to the cap, then
  // 100% once the stream resolves. Never exceeds the cap while in flight.
  const progress = done
    ? 1
    : Math.min(((stage + 1) / PROGRESS_STAGES.length) * PROGRESS_CAP, PROGRESS_CAP)
  const stageLabel = PROGRESS_STAGES[stage]

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

      {/* Time-staged progress bar. The thin track fills toward the cap; under
          reduced motion it renders at a static width (no tween, no shimmer). */}
      <div className="space-y-2">
        <div
          className="h-1 w-full overflow-hidden rounded-full bg-canvas-sunken"
          role="presentation"
        >
          {reduced ? (
            <div
              className="h-full rounded-full bg-accent-400"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          ) : (
            <motion.div
              className="h-full rounded-full bg-accent-400"
              initial={false}
              animate={{ width: `${Math.round(progress * 100)}%` }}
              transition={{ duration: durationSeconds('reveal'), ease: easeLux() }}
            />
          )}
        </div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-faint">
          {stageLabel}
        </p>
      </div>

      <div
        aria-live="polite"
        aria-busy="true"
        className="min-h-24 rounded-2xl border border-ink-line bg-canvas-raised p-6 text-left text-ink-soft shadow-frame"
      >
        {/* Stage changes are announced through this region (visually hidden so
            the live bar+label above stay the primary visual cue). */}
        <p className="sr-only">{stageLabel}</p>
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
