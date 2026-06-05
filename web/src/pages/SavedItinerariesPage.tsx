import { useCallback, useEffect, useState } from 'react'
import { deleteItinerary, getItinerary, listItineraries } from '../api/client'
import type { ItineraryListItem, ItineraryResponse } from '../types/itinerary'
import ItineraryView from '../components/ItineraryView'
import ErrorBanner from '../components/ErrorBanner'

const PER_PAGE = 20

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export default function SavedItinerariesPage() {
  const [items, setItems] = useState<ItineraryListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [selected, setSelected] = useState<ItineraryResponse | null>(null)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await listItineraries(p, PER_PAGE)
      setItems(res.items)
      setTotal(res.total)
      setPage(res.page)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(1)
  }, [load])

  async function view(id: string) {
    setError(null)
    try {
      const res = await getItinerary(id)
      setSelected(res)
    } catch (err) {
      setError(err)
    }
  }

  async function remove(id: string) {
    setError(null)
    try {
      await deleteItinerary(id)
      await load(page)
    } catch (err) {
      setError(err)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  if (selected) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
        >
          ← Back to saved itineraries
        </button>
        <ItineraryView itinerary={selected} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Saved itineraries</h1>
        <p className="mt-1 text-slate-600">Browse trips you have generated.</p>
      </div>

      {error != null && (
        <ErrorBanner error={error} onDismiss={() => setError(null)} onRetry={() => load(page)} />
      )}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-500">No saved itineraries yet. Generate one from the home page.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div>
                <p className="font-semibold text-slate-800">{it.destination}</p>
                <p className="text-sm text-slate-500">
                  {it.start_date} → {it.end_date} · {money(it.total_estimated_cost_usd)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => view(it.id)}
                  className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700"
                >
                  View
                </button>
                <button
                  type="button"
                  onClick={() => remove(it.id)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => load(page - 1)}
            className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => load(page + 1)}
            className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
