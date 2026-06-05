import { useState } from 'react'
import type { ActivityCategory, ItineraryDay } from '../types/itinerary'

interface DayCardProps {
  day: ItineraryDay
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

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export default function DayCard({ day, defaultOpen = false }: DayCardProps) {
  const [open, setOpen] = useState(defaultOpen)

  const dayTotal = day.activities.reduce((sum, a) => sum + a.estimated_cost_usd, 0)

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition hover:bg-slate-50"
      >
        <div className="flex items-center gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
            {day.day_number}
          </span>
          <div>
            <p className="font-semibold text-slate-800">{day.theme}</p>
            <p className="text-sm text-slate-500">{day.date}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm font-medium text-slate-600 sm:inline">
            {money(dayTotal)}
          </span>
          <svg
            className={`h-5 w-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-2 py-2 sm:px-4">
          <div className="overflow-x-auto">
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
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${categoryStyles[a.category]}`}
                      >
                        {a.category}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-slate-700">
                      {money(a.estimated_cost_usd)}
                    </td>
                    <td className="px-3 py-3">
                      <a
                        href={a.map_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
                      >
                        Map ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200">
                  <td colSpan={3} className="px-3 py-3 text-right font-medium text-slate-600">
                    Day total
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-slate-800">
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
