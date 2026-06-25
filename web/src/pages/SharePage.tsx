import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getSharedItinerary } from '../api/client'
import { useItinerary } from '../hooks/useItinerary'
import { Container, Section } from '../components/ui'
import ItineraryView from '../components/ItineraryView'
import ErrorBanner from '../components/ErrorBanner'
import LoadingSkeleton from '../components/LoadingSkeleton'

/**
 * Public, read-only shared itinerary at /share/:token. Loads the itinerary via
 * getSharedItinerary and renders ItineraryView in readOnly mode — no save,
 * export or share affordances. Anyone with the link can view it.
 */
export default function SharePage() {
  const { token } = useParams<{ token: string }>()

  // An empty token never resolves server-side; useItinerary surfaces the error
  // through the same banner path as any other load failure.
  const fetcher = useCallback(() => getSharedItinerary(token ?? ''), [token])
  const { itinerary, loading, error, reload, dismissError } = useItinerary(fetcher)

  return (
    <Container>
      <Section>
        {loading ? (
          <LoadingSkeleton />
        ) : error != null ? (
          <div className="mx-auto max-w-2xl space-y-4">
            <ErrorBanner error={error} onDismiss={dismissError} onRetry={reload} />
            <div className="text-center">
              <Link
                to="/discover"
                className="inline-flex rounded-full border border-ink-line bg-canvas-raised px-6 py-2.5 text-sm font-medium text-ink-soft transition-colors duration-hover hover:bg-canvas-sunken hover:text-ink focus-visible:outline-none"
              >
                Plan your own trip
              </Link>
            </div>
          </div>
        ) : itinerary ? (
          <div className="space-y-5">
            <div className="mx-auto max-w-4xl">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent-700">
                Shared itinerary
              </p>
              <p className="mt-1 text-sm text-ink-faint">
                A read-only trip plan shared with you.{' '}
                <Link
                  to="/discover"
                  className="font-medium text-accent-600 underline-offset-2 hover:underline focus-visible:outline-none"
                >
                  Plan your own →
                </Link>
              </p>
            </div>
            <ItineraryView itinerary={itinerary} readOnly />
          </div>
        ) : null}
      </Section>
    </Container>
  )
}
