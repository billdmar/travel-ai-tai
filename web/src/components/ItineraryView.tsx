import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ItineraryResponse } from '../types/itinerary'
import { removeDayActivity, reorderDayActivities, saveItinerary } from '../api/client'
import { money } from '../lib/format'
import { Confetti, Reveal } from '../components/ui'
import { DestinationImage } from './DestinationImage'
import DayCard from './DayCard'
import CostBreakdown from './CostBreakdown'
import PackingChecklist from './PackingChecklist'
import ExportShareButton from './ExportShareButton'
import ErrorBanner from './ErrorBanner'

// Code-split the interactive map: Leaflet + its CSS are heavy and only loaded
// when the traveler actually switches to the Map view, keeping the main bundle
// (and the default List view) lean.
const MapView = lazy(() => import('./MapView'))

type ViewMode = 'list' | 'map'

interface ItineraryViewProps {
  itinerary: ItineraryResponse
  onReset?: () => void
  /** Switches the app to the Saved page (toast deep link). */
  onViewSaved?: () => void
  /**
   * Opens the planning form in "adjust mode" to tweak and regenerate this trip.
   * Owner-only; omitted (and the button hidden) in {@link readOnly} mode.
   */
  onAdjust?: () => void
  /**
   * Public, read-only mode (the /share/:token page): hides all owner controls
   * — Save, Export and Share — so a shared itinerary cannot be mutated.
   */
  readOnly?: boolean
}

type SaveState = 'idle' | 'saving' | 'saved'

export default function ItineraryView({
  itinerary: initialItinerary,
  onReset,
  onViewSaved,
  onAdjust,
  readOnly = false,
}: ItineraryViewProps) {
  // Local copy so in-place edits (reorder/remove activities) re-render
  // optimistically. Reseeded during render (React's "adjust state when a prop
  // changes" pattern) whenever a different itinerary is passed in — keyed on the
  // server-owned id — so navigating between trips discards a prior edit buffer
  // without a cascading effect.
  const [itinerary, setItinerary] = useState<ItineraryResponse>(initialItinerary)
  const [seededId, setSeededId] = useState(initialItinerary.id)
  if (initialItinerary.id !== seededId) {
    setItinerary(initialItinerary)
    setSeededId(initialItinerary.id)
  }

  const { id, preferences, days, total_estimated_cost_usd, currency, summary, tips, provider } =
    itinerary

  const grandTotal = days.reduce(
    (sum, day) => sum + day.activities.reduce((s, a) => s + a.estimated_cost_usd, 0),
    0,
  )

  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<unknown>(null)
  const [saveState, setSaveState] = useState<SaveState>(initialItinerary.saved ? 'saved' : 'idle')
  const [saveError, setSaveError] = useState<unknown>(null)
  const [showToast, setShowToast] = useState(false)
  // One-shot save-celebration confetti. Deliberately declared OUTSIDE the
  // re-seed block above so switching trips (which reseeds `itinerary`) never
  // resets a burst in flight; the burst clears itself via Confetti's onDone.
  const [celebrate, setCelebrate] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  // Optimistically apply an in-place day edit, then reconcile with the server's
  // re-normalized response (authoritative grand total + map/booking links). On
  // failure we revert to the pre-edit snapshot and surface an error banner.
  async function applyEdit(
    optimistic: ItineraryResponse,
    call: () => Promise<ItineraryResponse>,
  ) {
    const previous = itinerary
    setEditError(null)
    setItinerary(optimistic)
    try {
      setItinerary(await call())
    } catch (err) {
      setItinerary(previous)
      setEditError(err)
    }
  }

  function handleReorder(dayNumber: number, from: number, to: number) {
    const day = days.find((d) => d.day_number === dayNumber)
    if (!day) return
    if (to < 0 || to >= day.activities.length) return
    // Build the index permutation that swaps `from` and `to`.
    const order = day.activities.map((_, i) => i)
    ;[order[from], order[to]] = [order[to], order[from]]
    const reordered = order.map((i) => day.activities[i])
    const optimistic: ItineraryResponse = {
      ...itinerary,
      days: days.map((d) =>
        d.day_number === dayNumber ? { ...d, activities: reordered } : d,
      ),
    }
    void applyEdit(optimistic, () => reorderDayActivities(id, dayNumber, order))
  }

  function handleRemove(dayNumber: number, index: number) {
    const day = days.find((d) => d.day_number === dayNumber)
    if (!day) return
    const remaining = day.activities.filter((_, i) => i !== index)
    const optimistic: ItineraryResponse = {
      ...itinerary,
      days: days.map((d) =>
        d.day_number === dayNumber ? { ...d, activities: remaining } : d,
      ),
    }
    void applyEdit(optimistic, () => removeDayActivity(id, dayNumber, index))
  }

  async function handleSave() {
    if (saveState !== 'idle') return
    setSaveError(null)
    setSaveState('saving')
    try {
      await saveItinerary(id)
      setSaveState('saved')
      setShowToast(true)
      setCelebrate(true)
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

      {editError != null && (
        <ErrorBanner error={editError} onDismiss={() => setEditError(null)} />
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

      {/* List | Map toggle (+ owner-only Edit toggle for in-place editing) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Itinerary view"
          className="inline-flex rounded-full border border-ink-line bg-canvas-raised p-1"
        >
          <button
            type="button"
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-hover focus-visible:outline-none ${
              viewMode === 'list'
                ? 'bg-ink text-canvas'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            List
          </button>
          <button
            type="button"
            onClick={() => setViewMode('map')}
            aria-pressed={viewMode === 'map'}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-hover focus-visible:outline-none ${
              viewMode === 'map'
                ? 'bg-ink text-canvas'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            Map
          </button>
        </div>

        {/* Edit toggle — owner-only, and only meaningful in the List view where
            the per-activity reorder/remove controls live. */}
        {!readOnly && viewMode === 'list' && (
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            aria-pressed={editing}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors duration-hover focus-visible:outline-none ${
              editing
                ? 'border-accent-300 bg-accent-50 text-accent-700'
                : 'border-ink-line bg-canvas-raised text-ink-soft hover:text-ink'
            }`}
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
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            {editing ? 'Done editing' : 'Edit activities'}
          </button>
        )}
      </div>

      {viewMode === 'map' ? (
        /* Map view */
        <Reveal>
          <Suspense
            fallback={
              <div
                role="status"
                className="flex h-[28rem] items-center justify-center rounded-2xl border border-ink-line bg-canvas-sunken text-sm text-ink-faint"
              >
                Loading map…
              </div>
            }
          >
            <MapView days={days} />
          </Suspense>
        </Reveal>
      ) : (
        /* Day cards */
        <div className="space-y-4">
          {days.map((day, i) => (
            <Reveal key={day.day_number} index={i}>
              <DayCard
                day={day}
                grandTotal={grandTotal}
                defaultOpen={i === 0}
                destination={preferences.destination}
                editing={editing}
                onReorder={(from, to) => handleReorder(day.day_number, from, to)}
                onRemove={(index) => handleRemove(day.day_number, index)}
              />
            </Reveal>
          ))}
        </div>
      )}

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

      {(onReset || (!readOnly && onAdjust)) && (
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {!readOnly && onAdjust && (
            <button
              type="button"
              onClick={onAdjust}
              className="inline-flex items-center gap-2 rounded-full bg-accent-500 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors duration-hover hover:bg-accent-400"
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
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              Adjust trip
            </button>
          )}
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="rounded-full border border-ink-line bg-canvas-raised px-6 py-2.5 text-sm font-medium text-ink-soft transition-colors duration-hover hover:bg-canvas-sunken hover:text-ink"
            >
              Plan another trip
            </button>
          )}
        </div>
      )}

      {/* Save-celebration burst — decorative, self-unmounting, reduced-motion
          aware (renders nothing under prefers-reduced-motion). */}
      {celebrate && <Confetti onDone={() => setCelebrate(false)} />}

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
