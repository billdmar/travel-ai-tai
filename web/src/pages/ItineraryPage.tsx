import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { ItineraryResponse } from '../types/itinerary'
import { getItinerary } from '../api/client'
import { Container, Section } from '../components/ui'
import ItineraryView from '../components/ItineraryView'
import ErrorBanner from '../components/ErrorBanner'
import LoadingSkeleton from '../components/LoadingSkeleton'

export default function ItineraryPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [itinerary, setItinerary] = useState<ItineraryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await getItinerary(id)
      setItinerary(res)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    // Mount/param-change data fetch; the setState inside `load` is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return (
    <Container>
      <Section>
        {loading ? (
          <LoadingSkeleton />
        ) : error != null ? (
          <div className="mx-auto max-w-2xl space-y-4">
            <ErrorBanner error={error} onDismiss={() => setError(null)} onRetry={load} />
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
          />
        ) : null}
      </Section>
    </Container>
  )
}
