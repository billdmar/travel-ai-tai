import { useState } from 'react'
import { createItinerary } from '../api/client'
import type { ItineraryResponse, TravelPreferences } from '../types/itinerary'
import PreferenceForm from '../components/PreferenceForm'
import ItineraryView from '../components/ItineraryView'
import LoadingSkeleton from '../components/LoadingSkeleton'
import ErrorBanner from '../components/ErrorBanner'
import heroImage from '../assets/hero.png'

interface HomePageProps {
  onNavigateSaved?: () => void
}

export default function HomePage({ onNavigateSaved }: HomePageProps) {
  const [loading, setLoading] = useState(false)
  const [itinerary, setItinerary] = useState<ItineraryResponse | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [lastPrefs, setLastPrefs] = useState<TravelPreferences | null>(null)

  async function generate(prefs: TravelPreferences) {
    setLastPrefs(prefs)
    setError(null)
    setLoading(true)
    setItinerary(null)
    try {
      const result = await createItinerary(prefs)
      setItinerary(result)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setItinerary(null)
    setError(null)
    setLastPrefs(null)
  }

  return (
    <div className="space-y-6">
      {!itinerary && !loading && (
        <div className="mx-auto max-w-2xl text-center">
          <img
            src={heroImage}
            alt=""
            className="mx-auto mb-6 aspect-[16/9] max-w-md rounded-2xl object-cover shadow-lg"
          />
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Plan your perfect trip with AI
          </h1>
          <p className="mt-3 text-base text-slate-600 sm:text-lg">
            Tell us your preferences and get a personalized, day-by-day itinerary in seconds.
          </p>
        </div>
      )}

      {error != null && (
        <ErrorBanner
          error={error}
          onDismiss={() => setError(null)}
          onRetry={lastPrefs ? () => generate(lastPrefs) : undefined}
        />
      )}

      {loading ? (
        <LoadingSkeleton />
      ) : itinerary ? (
        <ItineraryView
          itinerary={itinerary}
          onReset={reset}
          onViewSaved={onNavigateSaved}
        />
      ) : (
        <PreferenceForm onSubmit={generate} submitting={loading} />
      )}
    </div>
  )
}
