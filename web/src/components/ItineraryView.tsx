import type { ItineraryResponse } from '../types/itinerary'
import DayCard from './DayCard'

interface ItineraryViewProps {
  itinerary: ItineraryResponse
  onReset?: () => void
}

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export default function ItineraryView({ itinerary, onReset }: ItineraryViewProps) {
  const { preferences, days, total_estimated_cost_usd, currency, summary, tips, provider } =
    itinerary

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Summary card */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-brand-600 to-indigo-700 p-6 text-white shadow-md sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">{preferences.destination}</h2>
            <p className="mt-1 text-brand-100">
              {preferences.start_date} → {preferences.end_date} · {days.length}{' '}
              {days.length === 1 ? 'day' : 'days'}
            </p>
          </div>
          <div className="rounded-lg bg-white/15 px-4 py-2 text-right">
            <p className="text-xs uppercase tracking-wide text-brand-100">Est. total</p>
            <p className="text-2xl font-bold">
              {money(total_estimated_cost_usd)}{' '}
              <span className="text-sm font-normal">{currency}</span>
            </p>
          </div>
        </div>
        <p className="mt-4 text-brand-50">{summary}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-white/15 px-3 py-1 capitalize">{preferences.pace}</span>
          <span className="rounded-full bg-white/15 px-3 py-1 capitalize">
            {preferences.travel_style}
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1">
            {preferences.group_size} {preferences.group_size === 1 ? 'traveler' : 'travelers'}
          </span>
          {provider && (
            <span className="rounded-full bg-white/10 px-3 py-1 capitalize">via {provider}</span>
          )}
        </div>
      </div>

      {/* Day cards */}
      <div className="space-y-4">
        {days.map((day, i) => (
          <DayCard key={day.day_number} day={day} defaultOpen={i === 0} />
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
            className="rounded-lg border border-slate-300 px-6 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Plan another trip
          </button>
        </div>
      )}
    </div>
  )
}
