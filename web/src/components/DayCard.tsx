import { useState } from 'react'
import type { Activity, ActivityCategory, ItineraryDay } from '../types/itinerary'
import { money } from '../lib/format'

interface DayCardProps {
  day: ItineraryDay
  /** Grand total across all days, for the per-day cost bar. */
  grandTotal?: number
  defaultOpen?: boolean
}

// Unified, restrained palette: a single neutral chip per category, distinguished
// only by a small dot. To honor the one-accent rule, the accent marks the
// headline "attraction" category; all others read as quiet ink tones — category
// cueing without the loud rainbow, in service of the minimal/elegant aesthetic.
const categoryDot: Record<ActivityCategory, string> = {
  food: 'bg-ink-soft',
  attraction: 'bg-accent-500',
  transport: 'bg-ink-faint',
  accommodation: 'bg-ink-soft',
  leisure: 'bg-ink-faint',
  other: 'bg-ink-faint',
}

function CategoryChip({ category }: { category: ActivityCategory }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas-sunken px-2.5 py-0.5 text-xs font-medium capitalize text-ink-soft">
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${categoryDot[category]}`} />
      {category}
    </span>
  )
}

function MapLink({ activity }: { activity: Activity }) {
  if (!activity.map_url) {
    return <span className="text-xs text-ink-faint">—</span>
  }
  return (
    <a
      href={activity.map_url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${activity.place} in Google Maps (opens in new tab)`}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-ink-soft transition-colors duration-hover hover:text-accent-600 focus-visible:outline-none"
    >
      <svg
        aria-hidden="true"
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <span>Map</span>
    </a>
  )
}

/**
 * Affiliate "Book" link. Rendered only when the activity carries a `booking_url`.
 * Opens in a new tab; affiliate disclosure lives in the banner on ItineraryView.
 */
function BookLink({ activity }: { activity: Activity }) {
  if (!activity.booking_url) return null
  return (
    <a
      href={activity.booking_url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Book ${activity.place} (opens in new tab)`}
      className="inline-flex items-center gap-1 rounded-md border border-accent-200 px-2 py-1 text-xs font-semibold text-accent-700 transition-colors duration-hover hover:border-accent-300 hover:bg-accent-50 focus-visible:outline-none"
    >
      <svg
        aria-hidden="true"
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
        />
      </svg>
      <span>Book</span>
    </a>
  )
}

export default function DayCard({ day, grandTotal, defaultOpen = false }: DayCardProps) {
  const [open, setOpen] = useState(defaultOpen)

  const dayTotal = day.activities.reduce((sum, a) => sum + a.estimated_cost_usd, 0)
  const sharePct = grandTotal && grandTotal > 0 ? (dayTotal / grandTotal) * 100 : 0

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-line bg-canvas-raised shadow-frame transition duration-hover ease-lux hover:shadow-lift">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors duration-hover hover:bg-canvas-sunken/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500"
      >
        <div className="flex items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-50 font-serif text-lg font-medium text-accent-700 ring-1 ring-accent-100">
            {day.day_number}
          </span>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
              Day {day.day_number}
            </p>
            <h3 className="font-serif text-2xl font-medium leading-tight tracking-tight text-ink">
              {day.theme}
            </h3>
            <p className="text-sm text-ink-faint">{day.date}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold tabular-nums text-ink-soft">
            {money(dayTotal)}
          </span>
          <svg
            aria-hidden="true"
            className={`h-5 w-5 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Per-day cost share bar (decorative) */}
      {grandTotal != null && (
        <div aria-hidden="true" className="h-px bg-ink-line">
          <div className="h-px bg-accent-400" style={{ width: `${sharePct}%` }} />
        </div>
      )}

      {open && (
        <div className="border-t border-ink-line px-3 py-3 sm:px-5">
          {/* Mobile: stacked cards */}
          <ul className="space-y-3 sm:hidden">
            {day.activities.map((a, i) => (
              <li key={i} className="rounded-xl border border-ink-line p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink-soft">{a.time}</span>
                  <span className="text-sm font-semibold tabular-nums text-ink">
                    {money(a.estimated_cost_usd)}
                  </span>
                </div>
                <p className="mt-1 font-medium text-ink">{a.place}</p>
                <p className="text-xs leading-relaxed text-ink-soft">{a.description}</p>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <CategoryChip category={a.category} />
                  <div className="flex items-center gap-1.5">
                    <MapLink activity={a} />
                    <BookLink activity={a} />
                  </div>
                </div>
              </li>
            ))}
            <li className="flex items-center justify-between rounded-xl bg-canvas-sunken px-3 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Day subtotal
              </span>
              <span className="text-sm font-bold tabular-nums text-ink">
                {money(dayTotal)}
              </span>
            </li>
          </ul>

          {/* sm+ : table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Place</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 text-right font-medium">Est. cost</th>
                  <th className="px-3 py-2 font-medium">Links</th>
                </tr>
              </thead>
              <tbody>
                {day.activities.map((a, i) => (
                  <tr key={i} className="border-t border-ink-line align-top">
                    <td className="whitespace-nowrap px-3 py-3.5 font-medium text-ink-soft">
                      {a.time}
                    </td>
                    <td className="px-3 py-3.5">
                      <p className="font-medium text-ink">{a.place}</p>
                      <p className="text-xs leading-relaxed text-ink-soft">{a.description}</p>
                    </td>
                    <td className="px-3 py-3.5">
                      <CategoryChip category={a.category} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-right text-sm tabular-nums text-ink-soft">
                      {money(a.estimated_cost_usd)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <MapLink activity={a} />
                        <BookLink activity={a} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink-line bg-canvas-sunken/60">
                  <td
                    colSpan={3}
                    className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint"
                  >
                    Day subtotal
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-ink">
                    {money(dayTotal)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
