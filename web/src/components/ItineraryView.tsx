import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ItineraryResponse } from '../types/itinerary'
import { saveItinerary } from '../api/client'
import { money } from '../lib/format'
import { Reveal } from '../components/ui'
import { DestinationImage } from './DestinationImage'
import DayCard from './DayCard'
import CostBreakdown from './CostBreakdown'
import PackingChecklist from './PackingChecklist'
import ExportShareButton from './ExportShareButton'
import ErrorBanner from './ErrorBanner'

interface ItineraryViewProps {
  itinerary: ItineraryResponse
  onReset?: () => void
  /** Switches the app to the Saved page (toast deep link). */
  onViewSaved?: () => void
  /**
   * Public, read-only mode (the /share/:token page): hides all owner controls
   * — Save, Export and Share — so a shared itinerary cannot be mutated.
   */
  readOnly?: boolean
}

type SaveState = 'idle' | 'saving' | 'saved'

export default function ItineraryView({
  itinerary,
  onReset,
  onViewSaved,
  readOnly = false,
}: ItineraryViewProps) {
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

      {/* Editorial cover photo — sets the travel-magazine tone */}
      <Reveal>
        <DestinationImage
          query={preferences.destination}
          alt={`${preferences.destination} cover photo`}
          aspect="aspect-[16/7]"
          eager
        />
      </Reveal>

      {/* Summary / hero card — warm charcoal, the cover of the travel document */}
      <Reveal>
        <div className="overflow-hidden rounded-3xl border border-ink bg-ink p-7 text-canvas shadow-frame sm:p-9">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent-300">
                Your itinerary
              </p>
              <h2 className="mt-2 font-serif text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
                {preferences.destination}
              </h2>
              <p className="mt-3 text-sm text-ink-faint">
                {preferences.start_date} → {preferences.end_date} · {days.length}{' '}
                {days.length === 1 ? 'day' : 'days'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              {!readOnly && saveState === 'idle' && (
                <button
                  type="button"
                  onClick={handleSave}
                  className="inline-flex items-center gap-2 rounded-full bg-accent-500 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors duration-hover hover:bg-accent-400 focus-visible:outline-none"
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
              {!readOnly && saveState === 'saving' && (
                <button
                  type="button"
                  disabled
                  aria-busy="true"
                  className="inline-flex cursor-wait items-center gap-2 rounded-full bg-accent-500/70 px-5 py-2 text-sm font-medium text-white"
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
              {!readOnly && saveState === 'saved' && (
                <span
                  aria-label="Itinerary saved"
                  className="inline-flex cursor-default items-center gap-2 rounded-full bg-accent-500/15 px-5 py-2 text-sm font-medium text-accent-200 ring-1 ring-accent-400/30"
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
                <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">Est. total</p>
                <p className="font-serif text-4xl font-medium tabular-nums text-white">
                  {money(total_estimated_cost_usd)}{' '}
                  <span className="text-sm font-normal text-ink-faint">{currency}</span>
                </p>
                <p className="text-[11px] text-ink-faint">Sum of all activities</p>
              </div>
            </div>
          </div>
          {summary && <p className="mt-6 max-w-2xl leading-relaxed text-canvas/80">{summary}</p>}
          <div className="mt-6 flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full bg-white/5 px-3 py-1 capitalize text-canvas/85 ring-1 ring-white/10">
              {preferences.pace}
            </span>
            <span className="rounded-full bg-white/5 px-3 py-1 capitalize text-canvas/85 ring-1 ring-white/10">
              {preferences.travel_style}
            </span>
            <span className="rounded-full bg-white/5 px-3 py-1 text-canvas/85 ring-1 ring-white/10">
              {preferences.group_size} {preferences.group_size === 1 ? 'traveler' : 'travelers'}
            </span>
            {provider && (
              <span className="rounded-full bg-white/5 px-3 py-1 capitalize text-ink-faint ring-1 ring-white/10">
                via {provider}
              </span>
            )}
          </div>
        </div>
      </Reveal>

      {/* FTC affiliate disclosure banner */}
      <div className="flex items-start gap-2.5 rounded-xl border border-ink-line bg-canvas-sunken px-4 py-3 text-xs text-ink-soft">
        <svg
          aria-hidden="true"
          className="mt-px h-4 w-4 shrink-0 text-ink-faint"
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
            className="font-medium text-accent-600 underline-offset-2 hover:underline focus-visible:outline-none"
          >
            Learn more
          </Link>
          .
        </p>
      </div>

      {/* Export / share controls — owner only */}
      {!readOnly && (
        <Reveal>
          <ExportShareButton itineraryId={id} />
        </Reveal>
      )}

      {/* Budget breakdown + trip summary */}
      <Reveal>
        <CostBreakdown itinerary={itinerary} />
      </Reveal>

      {/* Day cards */}
      <div className="space-y-4">
        {days.map((day, i) => (
          <Reveal key={day.day_number} index={i}>
            <DayCard
              day={day}
              grandTotal={grandTotal}
              defaultOpen={i === 0}
              destination={preferences.destination}
            />
          </Reveal>
        ))}
      </div>

      {/* Packing checklist */}
      <Reveal>
        <PackingChecklist itinerary={itinerary} />
      </Reveal>

      {/* Tips */}
      {tips.length > 0 && (
        <div className="rounded-2xl border border-ink-line bg-canvas-raised p-6 shadow-frame">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink-faint">
            Travel tips
          </h3>
          <ul className="space-y-3">
            {tips.map((tip, i) => (
              <li key={i} className="flex gap-3 leading-relaxed text-ink-soft">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" />
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
            className="rounded-full border border-ink-line bg-canvas-raised px-6 py-2.5 text-sm font-medium text-ink-soft transition-colors duration-hover hover:bg-canvas-sunken hover:text-ink focus-visible:outline-none"
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
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-ink-line bg-canvas-raised px-4 py-3 shadow-lift motion-safe:animate-fadeIn"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-500 text-xs text-white">
            ✓
          </span>
          <span className="text-sm font-medium text-ink">Saved to your itineraries.</span>
          {onViewSaved && (
            <button
              type="button"
              onClick={onViewSaved}
              className="rounded text-sm font-medium text-accent-600 hover:text-accent-700 hover:underline focus-visible:outline-none"
            >
              View in Saved →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
