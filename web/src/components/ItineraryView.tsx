import { useEffect, useRef, useState } from 'react'
import type { ItineraryResponse } from '../types/itinerary'
import { saveItinerary } from '../api/client'
import { money } from '../lib/format'
import DayCard from './DayCard'
import ErrorBanner from './ErrorBanner'

interface ItineraryViewProps {
  itinerary: ItineraryResponse
  onReset?: () => void
  /** Switches the app to the Saved page (toast deep link). */
  onViewSaved?: () => void
}

type SaveState = 'idle' | 'saving' | 'saved'

export default function ItineraryView({ itinerary, onReset, onViewSaved }: ItineraryViewProps) {
  const { id, preferences, days, total_estimated_cost_usd, currency, summary, tips, provider } =
    itinerary

  const grandTotal = days.reduce(
    (sum, day) => sum + day.activities.reduce((s, a) => s + a.estimated_cost_usd, 0),
    0,
  )

  const [saveState, setSaveState] = useState<SaveState>(itinerary.saved ? 'saved' : 'idle')
  const [saveError, setSaveError] = useState<unknown>(null)
  const [showToast, setShowToast] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  async function handleSave() {
    if (saveState !== 'idle') return
    setSaveError(null)
    setSaveState('saving')
    try {
      await saveItinerary(id)
      setSaveState('saved')
      setShowToast(true)
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setShowToast(false), 5000)
    } catch (err) {
      setSaveState('idle')
      setSaveError(err)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {saveError != null && (
        <ErrorBanner error={saveError} onDismiss={() => setSaveError(null)} onRetry={handleSave} />
      )}

      {/* Summary card */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-brand-600 to-indigo-700 p-6 text-white shadow-md sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {preferences.destination}
            </h2>
            <p className="mt-1 text-brand-100">
              {preferences.start_date} → {preferences.end_date} · {days.length}{' '}
              {days.length === 1 ? 'day' : 'days'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {saveState === 'idle' && (
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-600"
              >
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5z"
                  />
                </svg>
                Save itinerary
              </button>
            )}
            {saveState === 'saving' && (
              <button
                type="button"
                disabled
                aria-busy="true"
                className="inline-flex cursor-wait items-center gap-2 rounded-lg bg-white/80 px-4 py-2 text-sm font-semibold text-brand-700"
              >
                <svg
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
                Saving…
              </button>
            )}
            {saveState === 'saved' && (
              <button
                type="button"
                disabled
                aria-label="Itinerary saved"
                className="inline-flex cursor-default items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white"
              >
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Saved
              </button>
            )}
            <div className="rounded-lg bg-white/15 px-4 py-2 text-right ring-1 ring-white/10">
              <p className="text-xs uppercase tracking-wide text-brand-100">Est. total</p>
              <p className="text-2xl font-bold tabular-nums">
                {money(total_estimated_cost_usd)}{' '}
                <span className="text-sm font-normal">{currency}</span>
              </p>
              <p className="text-[11px] text-brand-100">Sum of all activities</p>
            </div>
          </div>
        </div>
        <p className="mt-4 text-brand-50">{summary}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-full bg-white/15 px-3 py-1 capitalize ring-1 ring-white/10">
            {preferences.pace}
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1 capitalize ring-1 ring-white/10">
            {preferences.travel_style}
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1 ring-1 ring-white/10">
            {preferences.group_size} {preferences.group_size === 1 ? 'traveler' : 'travelers'}
          </span>
          {provider && (
            <span className="rounded-full bg-white/10 px-3 py-1 capitalize ring-1 ring-white/10">
              via {provider}
            </span>
          )}
        </div>
      </div>

      {/* Day cards */}
      <div className="space-y-4">
        {days.map((day, i) => (
          <DayCard key={day.day_number} day={day} grandTotal={grandTotal} defaultOpen={i === 0} />
        ))}
      </div>

      {/* Tips */}
      {tips.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-lg font-semibold text-slate-800">Travel tips</h3>
          <ul className="space-y-2">
            {tips.map((tip, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-600">
                <span className="text-brand-600">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {onReset && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg border border-slate-300 px-6 py-2 font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            Plan another trip
          </button>
        </div>
      )}

      {/* Confirmation toast */}
      {showToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-lg motion-safe:animate-fadeIn"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs text-white">
            ✓
          </span>
          <span className="text-sm font-medium text-slate-800">Saved to your itineraries.</span>
          {onViewSaved && (
            <button
              type="button"
              onClick={onViewSaved}
              className="rounded text-sm font-semibold text-brand-600 hover:text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              View in Saved →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
