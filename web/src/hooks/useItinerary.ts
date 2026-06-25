import { useCallback, useEffect, useState } from 'react'
import type { ItineraryResponse } from '../types/itinerary'

interface UseItineraryResult {
  /** The loaded itinerary, or null until the first successful fetch. */
  itinerary: ItineraryResponse | null
  /** True while a fetch is in flight. */
  loading: boolean
  /** The error from the most recent failed fetch, or null. */
  error: unknown
  /** Re-run the fetch (e.g. a Retry control). No-op when disabled. */
  reload: () => Promise<void>
  /** Clear the current error (e.g. an ErrorBanner dismiss control). */
  dismissError: () => void
  /**
   * Imperatively set the itinerary without a fetch — used when the value
   * arrives by another path (e.g. a live stream resolving on ItineraryPage).
   */
  setItinerary: (it: ItineraryResponse) => void
}

/**
 * Load a single itinerary, owning the load / loading / error / reload lifecycle
 * shared by the by-id ({@link getItinerary}) and shared-link
 * ({@link getSharedItinerary}) views.
 *
 * `fetcher` should be a stable callback (wrap it in ``useCallback`` keyed on the
 * id/token) that returns the itinerary; it re-runs whenever its identity
 * changes. Pass ``enabled: false`` to suppress the automatic fetch when the
 * value will be supplied another way — ItineraryPage uses this while a live
 * stream is the source of truth, then injects the result via
 * {@link setItinerary}.
 */
export function useItinerary(
  fetcher: () => Promise<ItineraryResponse>,
  enabled = true,
): UseItineraryResult {
  const [itinerary, setItinerary] = useState<ItineraryResponse | null>(null)
  // Start in the loading state only when we intend to fetch on mount; a disabled
  // hook (stream-seeded) renders its own placeholder meanwhile.
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<unknown>(null)

  const reload = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError(null)
    try {
      setItinerary(await fetcher())
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [enabled, fetcher])

  const dismissError = useCallback(() => setError(null), [])

  useEffect(() => {
    // Mount/fetcher-change data fetch; the setState inside `reload` is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload])

  return { itinerary, loading, error, reload, dismissError, setItinerary }
}
