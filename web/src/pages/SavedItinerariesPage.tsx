import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteItinerary, getItinerary, listItineraries } from '../api/client'
import type { ItineraryListItem, ItineraryResponse } from '../types/itinerary'
import { money } from '../lib/format'
import { Container, Section, Reveal } from '../components/ui'
import ItineraryView from '../components/ItineraryView'
import ErrorBanner from '../components/ErrorBanner'

const PER_PAGE = 20

// At most three trips compare cleanly side by side; fewer than two has nothing
// to contrast. The Compare button is enabled only inside this range.
const MIN_COMPARE = 2
const MAX_COMPARE = 3

// localStorage key for the persisted compare selection. Stored as a JSON array
// of itinerary ids so the choice survives a reload without any backend — a fit
// for the app's no-auth, single-session model.
const COMPARE_KEY = 'tai.compareSelection'

/** Read the persisted compare selection, tolerating absent/corrupt storage. */
function readSelection(): string[] {
  try {
    const raw = localStorage.getItem(COMPARE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Persist the compare selection; ignore storage failures (private mode, etc). */
function writeSelection(ids: string[]): void {
  try {
    localStorage.setItem(COMPARE_KEY, JSON.stringify(ids))
  } catch {
    // Storage may be unavailable (private browsing, quota); selection still
    // works in-memory for the current session.
  }
}

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
          className="flex items-center justify-between gap-4 rounded-2xl border border-ink-line bg-canvas-raised p-5 shadow-frame"
        >
          <div className="w-full animate-pulse space-y-2 motion-reduce:animate-none">
            <div className="h-4 w-1/3 rounded bg-canvas-sunken" />
            <div className="h-3 w-1/2 rounded bg-canvas-sunken" />
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
  // The id whose delete request is in flight; disables its Confirm button so a
  // slow network can't fire a second delete from a double-click.
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // Ids picked for side-by-side comparison; seeded from localStorage so the
  // choice survives a reload.
  const [compareIds, setCompareIds] = useState<string[]>(() => readSelection())

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
    if (deletingId) return
    setError(null)
    // Keep the confirm row mounted (don't clear confirmId yet) so its button can
    // show the disabled in-flight state; both are reset once the delete settles.
    setDeletingId(id)
    try {
      await deleteItinerary(id)
      setConfirmId(null)
      await load(page)
    } catch (err) {
      setError(err)
    } finally {
      setDeletingId(null)
    }
  }

  // Toggle an id in the compare selection, capping at MAX_COMPARE, and persist.
  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= MAX_COMPARE
          ? prev
          : [...prev, id]
      writeSelection(next)
      return next
    })
  }

  // Navigate to the comparison view with the selected ids as a query param so
  // the page is shareable/refreshable without relying on router state.
  function compare() {
    if (compareIds.length < MIN_COMPARE) return
    navigate(`/compare?ids=${compareIds.map(encodeURIComponent).join(',')}`)
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
              className="rounded text-sm font-medium text-accent-600 hover:text-accent-700 hover:underline focus-visible:outline-none"
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
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent-700">
              Your trips
            </p>
            <h1 className="mt-4 font-serif text-5xl font-medium leading-[1.05] tracking-tight text-ink sm:text-6xl">
              Saved itineraries
            </h1>
            <p className="mt-4 text-lg text-ink-soft">Browse trips you have saved.</p>
          </div>

          {error != null && (
            <ErrorBanner error={error} onDismiss={() => setError(null)} onRetry={() => load(page)} />
          )}

          {!loading && items.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-line bg-canvas-raised px-5 py-3">
              <p className="text-sm text-ink-soft">
                {compareIds.length === 0
                  ? `Select ${MIN_COMPARE}–${MAX_COMPARE} trips to compare.`
                  : `${compareIds.length} selected (max ${MAX_COMPARE}).`}
              </p>
              <button
                type="button"
                onClick={compare}
                disabled={compareIds.length < MIN_COMPARE}
                className="rounded-full bg-accent-500 px-5 py-1.5 text-sm font-medium text-white transition-colors duration-hover hover:bg-accent-600 disabled:opacity-40 focus-visible:outline-none"
              >
                Compare
              </button>
            </div>
          )}

          {loading ? (
            <SkeletonList />
          ) : items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-ink-line bg-canvas-raised p-14 text-center">
              {/* Gentle staggered entrance — each element lifts in a beat after
                  the last. Reveal passes children straight through under
                  reduced motion, so the empty state stays static there. */}
              <Reveal index={0}>
                <svg
                  aria-hidden="true"
                  className="mx-auto h-10 w-10 text-ink-faint"
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
              </Reveal>
              <Reveal index={1}>
                <h2 className="mt-5 font-serif text-2xl font-medium tracking-tight text-ink">
                  No saved itineraries yet
                </h2>
              </Reveal>
              <Reveal index={2}>
                <p className="mt-2 text-ink-soft">
                  Generate a trip and hit Save to keep it here for later.
                </p>
              </Reveal>
              <Reveal index={3}>
                <button
                  type="button"
                  onClick={goPlan}
                  className="mt-6 rounded-full bg-accent-500 px-6 py-2.5 text-sm font-medium text-white transition-colors duration-hover hover:bg-accent-600 focus-visible:outline-none"
                >
                  Plan a trip
                </button>
              </Reveal>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((it, i) => (
                <Reveal
                  key={it.id}
                  as="li"
                  index={i}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ink-line bg-canvas-raised p-6 shadow-frame transition duration-hover ease-lux hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <div className="flex items-center gap-4">
                    <input
                      type="checkbox"
                      checked={compareIds.includes(it.id)}
                      disabled={!compareIds.includes(it.id) && compareIds.length >= MAX_COMPARE}
                      onChange={() => toggleCompare(it.id)}
                      aria-label={`Select ${it.destination} to compare`}
                      className="h-5 w-5 shrink-0 rounded border-ink-line text-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-40"
                    />
                    <div>
                      <p className="font-serif text-2xl font-medium leading-tight tracking-tight text-ink">
                        {it.destination}
                      </p>
                      <p className="mt-1 text-sm text-ink-soft">
                        {it.start_date} → {it.end_date} ·{' '}
                        <span className="tabular-nums">{money(it.total_estimated_cost_usd)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => view(it.id)}
                      className="rounded-full bg-accent-500 px-5 py-1.5 text-sm font-medium text-white transition-colors duration-hover hover:bg-accent-600 focus-visible:outline-none"
                    >
                      View
                    </button>
                    {confirmId === it.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => remove(it.id)}
                          disabled={deletingId === it.id}
                          aria-busy={deletingId === it.id}
                          aria-label={`Confirm delete itinerary for ${it.destination}`}
                          className="rounded-full bg-red-600 px-3.5 py-1.5 text-sm font-medium text-white transition-colors duration-hover hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
                        >
                          {deletingId === it.id ? 'Deleting…' : 'Confirm?'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          className="rounded-full border border-ink-line px-3.5 py-1.5 text-sm font-medium text-ink-soft transition-colors duration-hover hover:bg-canvas-sunken focus-visible:outline-none"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(it.id)}
                        aria-label={`Delete itinerary for ${it.destination}`}
                        className="rounded-full border border-ink-line px-3.5 py-1.5 text-sm font-medium text-ink-soft transition-colors duration-hover hover:bg-canvas-sunken focus-visible:outline-none"
                      >
                        Delete
                      </button>
                    )}
                  </div>
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
                className="rounded-full border border-ink-line px-5 py-1.5 text-sm font-medium text-ink-soft transition-colors duration-hover hover:bg-canvas-sunken disabled:opacity-40 focus-visible:outline-none"
              >
                Previous
              </button>
              <span className="text-sm text-ink-faint">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => load(page + 1)}
                className="rounded-full border border-ink-line px-5 py-1.5 text-sm font-medium text-ink-soft transition-colors duration-hover hover:bg-canvas-sunken disabled:opacity-40 focus-visible:outline-none"
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
