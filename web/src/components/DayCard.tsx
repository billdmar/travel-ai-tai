import { useState } from 'react'
import type { Activity, ActivityCategory, ItineraryDay } from '../types/itinerary'
import { money } from '../lib/format'

interface DayCardProps {
  day: ItineraryDay
  /** Grand total across all days, for the per-day cost bar. */
  grandTotal?: number
  defaultOpen?: boolean
}

const categoryStyles: Record<ActivityCategory, string> = {
  food: 'bg-rose-100 text-rose-700',
  attraction: 'bg-indigo-100 text-indigo-700',
  transport: 'bg-sky-100 text-sky-700',
  accommodation: 'bg-amber-100 text-amber-700',
  leisure: 'bg-emerald-100 text-emerald-700',
  other: 'bg-slate-100 text-slate-700',
}

function CategoryChip({ category }: { category: ActivityCategory }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${categoryStyles[category]}`}
    >
      {category}
    </span>
  )
}

function MapLink({ activity }: { activity: Activity }) {
  if (!activity.map_url) {
    return <span className="text-xs text-slate-400">—</span>
  }
  return (
    <a
      href={activity.map_url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${activity.place} in Google Maps (opens in new tab)`}
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-brand-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
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

export default function DayCard({ day, grandTotal, defaultOpen = false }: DayCardProps) {
  const [open, setOpen] = useState(defaultOpen)

  const dayTotal = day.activities.reduce((sum, a) => sum + a.estimated_cost_usd, 0)
  const sharePct = grandTotal && grandTotal > 0 ? (dayTotal / grandTotal) * 100 : 0

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
      >
        <div className="flex items-center gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white ring-2 ring-brand-100">
            {day.day_number}
          </span>
          <div>
            <h3 className="font-semibold text-slate-900">{day.theme}</h3>
            <p className="text-sm text-slate-500">{day.date}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-slate-700">
            {money(dayTotal)}
          </span>
          <svg
            aria-hidden="true"
            className={`h-5 w-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
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
        <div aria-hidden="true" className="h-1 bg-slate-100">
          <div className="h-1 bg-brand-500" style={{ width: `${sharePct}%` }} />
        </div>
      )}

      {open && (
        <div className="border-t border-slate-100 px-2 py-2 sm:px-4">
          {/* Mobile: stacked cards */}
          <ul className="space-y-3 sm:hidden">
            {day.activities.map((a, i) => (
              <li key={i} className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">{a.time}</span>
                  <span className="text-sm font-semibold tabular-nums text-slate-900">
                    {money(a.estimated_cost_usd)}
                  </span>
                </div>
                <p className="mt-1 font-medium text-slate-900">{a.place}</p>
                <p className="text-xs text-slate-500">{a.description}</p>
                <div className="mt-2 flex items-center justify-between">
                  <CategoryChip category={a.category} />
                  <MapLink activity={a} />
                </div>
              </li>
            ))}
            <li className="flex items-center justify-between rounded-lg border-2 border-slate-200 bg-slate-50/60 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Day subtotal
              </span>
              <span className="text-sm font-bold tabular-nums text-slate-900">
                {money(dayTotal)}
              </span>
            </li>
          </ul>

          {/* sm+ : table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Place</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 text-right font-medium">Est. cost</th>
                  <th className="px-3 py-2 font-medium">Map</th>
                </tr>
              </thead>
              <tbody>
                {day.activities.map((a, i) => (
                  <tr key={i} className="border-t border-slate-100 align-top">
                    <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-700">
                      {a.time}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-800">{a.place}</p>
                      <p className="text-xs text-slate-500">{a.description}</p>
                    </td>
                    <td className="px-3 py-3">
                      <CategoryChip category={a.category} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-slate-700">
                      {money(a.estimated_cost_usd)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <MapLink activity={a} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/60">
                  <td
                    colSpan={3}
                    className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Day subtotal
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-slate-900">
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
