import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ItineraryResponse } from '../types/itinerary'
import { saveItinerary } from '../api/client'
import { money } from '../lib/format'
import { Reveal } from '../components/ui'
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

      {/* Summary / hero card — charcoal & restrained, with a single accent rule */}
      <Reveal>
        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-7 text-slate-100 shadow-sm sm:p-9">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-brand-300">
                Your itinerary
              </p>
              <h2 className="mt-1.5 text-3xl font-semibold tracking-tight sm:text-4xl">
                {preferences.destination}
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                {preferences.start_date} → {preferences.end_date} · {days.length}{' '}
                {days.length === 1 ? 'day' : 'days'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              {saveState === 'idle' && (
                <button
                  type="button"
                  onClick={handleSave}
                  className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
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
                  className="inline-flex cursor-wait items-center gap-2 rounded-full bg-brand-500/70 px-5 py-2 text-sm font-semibold text-white"
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
                <span
                  aria-label="Itinerary saved"
                  className="inline-flex cursor-default items-center gap-2 rounded-full bg-emerald-500/15 px-5 py-2 text-sm font-semibold text-emerald-300 ring-1 ring-emerald-400/30"
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
                </span>
              )}
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Est. total</p>
                <p className="text-3xl font-semibold tabular-nums text-white">
                  {money(total_estimated_cost_usd)}{' '}
                  <span className="text-sm font-normal text-slate-400">{currency}</span>
                </p>
                <p className="text-[11px] text-slate-500">Sum of all activities</p>
              </div>
            </div>
          </div>
          {summary && <p className="mt-6 max-w-2xl leading-relaxed text-slate-300">{summary}</p>}
          <div className="mt-6 flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full bg-white/5 px-3 py-1 capitalize text-slate-300 ring-1 ring-white/10">
              {preferences.pace}
            </span>
            <span className="rounded-full bg-white/5 px-3 py-1 capitalize text-slate-300 ring-1 ring-white/10">
              {preferences.travel_style}
            </span>
            <span className="rounded-full bg-white/5 px-3 py-1 text-slate-300 ring-1 ring-white/10">
              {preferences.group_size} {preferences.group_size === 1 ? 'traveler' : 'travelers'}
            </span>
            {provider && (
              <span className="rounded-full bg-white/5 px-3 py-1 capitalize text-slate-400 ring-1 ring-white/10">
                via {provider}
              </span>
            )}
          </div>
        </div>
      </Reveal>

      {/* FTC affiliate disclosure banner */}
      <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <svg
          aria-hidden="true"
          className="mt-px h-4 w-4 shrink-0 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
          />
        </svg>
        <p className="leading-relaxed">
          Some links are affiliate links; we may earn a commission at no cost to you.{' '}
          <Link
            to="/disclosure"
            className="font-medium text-brand-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Learn more
          </Link>
          .
        </p>
      </div>

      {/* Day cards */}
      <div className="space-y-4">
        {days.map((day, i) => (
          <Reveal key={day.day_number}>
            <DayCard day={day} grandTotal={grandTotal} defaultOpen={i === 0} />
          </Reveal>
        ))}
      </div>

      {/* Tips */}
      {tips.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
            Travel tips
          </h3>
          <ul className="space-y-2.5">
            {tips.map((tip, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-slate-600">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
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
            className="rounded-full border border-slate-300 px-6 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
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
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg motion-safe:animate-fadeIn"
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
