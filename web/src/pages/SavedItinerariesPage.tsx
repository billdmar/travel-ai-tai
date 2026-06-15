import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteItinerary, getItinerary, listItineraries } from '../api/client'
import type { ItineraryListItem, ItineraryResponse } from '../types/itinerary'
import { money } from '../lib/format'
import { Container, Section, Reveal } from '../components/ui'
import ItineraryView from '../components/ItineraryView'
import ErrorBanner from '../components/ErrorBanner'

const PER_PAGE = 20

interface SavedItinerariesPageProps {
  /** Optional legacy callback; when absent we route to /discover via the router. */
  onNavigateHome?: () => void
}

function SkeletonList() {
  return (
    <ul className="space-y-3" aria-busy="true" aria-label="Loading saved itineraries">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="w-full animate-pulse space-y-2 motion-reduce:animate-none">
            <div className="h-4 w-1/3 rounded bg-slate-200" />
            <div className="h-3 w-1/2 rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  )
}

export default function SavedItinerariesPage({ onNavigateHome }: SavedItinerariesPageProps) {
  const navigate = useNavigate()
  const goPlan = onNavigateHome ?? (() => navigate('/discover'))

  const [items, setItems] = useState<ItineraryListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [selected, setSelected] = useState<ItineraryResponse | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

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
    // Mount-time data fetch; the synchronous setState in `load` is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    setConfirmId(null)
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
      <Container>
        <Section>
          <div className="space-y-5">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              ← Back to saved itineraries
            </button>
            <ItineraryView itinerary={selected} onReset={goPlan} />
          </div>
        </Section>
      </Container>
    )
  }

  return (
    <Container>
      <Section>
        <div className="mx-auto max-w-4xl space-y-6">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-brand-600">
              Your trips
            </p>
            <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-slate-900">
              Saved itineraries
            </h1>
            <p className="mt-1.5 text-slate-500">Browse trips you have saved.</p>
          </div>

          {error != null && (
            <ErrorBanner error={error} onDismiss={() => setError(null)} onRetry={() => load(page)} />
          )}

          {loading ? (
            <SkeletonList />
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <svg
                aria-hidden="true"
                className="mx-auto h-10 w-10 text-slate-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
                />
              </svg>
              <h2 className="mt-4 font-semibold text-slate-700">No saved itineraries yet</h2>
              <p className="mt-1 text-sm text-slate-500">
                Generate a trip and hit Save to keep it here for later.
              </p>
              <button
                type="button"
                onClick={goPlan}
                className="mt-5 rounded-full bg-brand-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                Plan a trip
              </button>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((it) => (
                <Reveal key={it.id}>
                  <li className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md">
                    <div>
                      <p className="font-semibold text-slate-900">{it.destination}</p>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {it.start_date} → {it.end_date} ·{' '}
                        <span className="tabular-nums">{money(it.total_estimated_cost_usd)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => view(it.id)}
                        className="rounded-full bg-brand-600 px-5 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                      >
                        View
                      </button>
                      {confirmId === it.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => remove(it.id)}
                            aria-label={`Confirm delete itinerary for ${it.destination}`}
                            className="rounded-full bg-red-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                          >
                            Confirm?
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmId(null)}
                            className="rounded-full border border-slate-300 px-3.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmId(it.id)}
                          aria-label={`Delete itinerary for ${it.destination}`}
                          className="rounded-full border border-slate-300 px-3.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </li>
                </Reveal>
              ))}
            </ul>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => load(page - 1)}
                className="rounded-full border border-slate-300 px-5 py-1.5 text-sm font-medium text-slate-700 transition disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
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
                className="rounded-full border border-slate-300 px-5 py-1.5 text-sm font-medium text-slate-700 transition disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </Section>
    </Container>
  )
}
