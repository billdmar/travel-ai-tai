import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getItinerary } from '../api/client'
import type { ItineraryResponse } from '../types/itinerary'
import { money } from '../lib/format'
import { Container, Section } from '../components/ui'
import CostBreakdown from '../components/CostBreakdown'

// One slot per requested id. A slot resolves to the fetched itinerary, or to a
// `missing` marker when the id was deleted (404) or otherwise failed to load —
// the page renders a placeholder column for it instead of crashing.
interface Slot {
  id: string
  itinerary: ItineraryResponse | null
  missing: boolean
}

/** The per-column min/max width so columns stay readable yet stack on mobile. */
const COLUMN = 'min-w-[16rem] max-w-sm flex-1'

/**
 * Parse the `ids` query param into a de-duplicated, 2-3 length list. The link
 * built on the Saved page joins ids with commas; we clamp here so a hand-edited
 * URL can't blow up the layout with dozens of columns.
 */
function parseIds(raw: string | null): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  for (const id of raw.split(',')) {
    const trimmed = id.trim()
    if (trimmed) seen.add(trimmed)
  }
  return Array.from(seen).slice(0, 3)
}

/** Trip length in days, taken from the generated itinerary's day count. */
function tripLength(it: ItineraryResponse): number {
  return it.days.length
}

function MissingColumn({ id }: { id: string }) {
  return (
    <div className={`${COLUMN} rounded-2xl border border-dashed border-ink-line bg-canvas-raised p-6 text-center`}>
      <p className="font-serif text-xl font-medium text-ink">Trip unavailable</p>
      <p className="mt-2 text-sm text-ink-soft">
        This itinerary could not be loaded — it may have been deleted.
      </p>
      <p className="mt-3 break-all text-xs text-ink-faint">{id}</p>
    </div>
  )
}

export default function ComparePage() {
  const [params] = useSearchParams()
  const ids = parseIds(params.get('ids'))
  // Serialize the parsed ids so the effect re-runs only when the set changes,
  // not on every render (a fresh array identity would otherwise loop).
  const idsKey = ids.join(',')

  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (toLoad: string[]) => {
    setLoading(true)
    const resolved = await Promise.all(
      toLoad.map(async (id): Promise<Slot> => {
        try {
          const itinerary = await getItinerary(id)
          return { id, itinerary, missing: false }
        } catch {
          // A deleted/unreachable id degrades to a placeholder column rather
          // than failing the whole comparison.
          return { id, itinerary: null, missing: true }
        }
      }),
    )
    setSlots(resolved)
    setLoading(false)
  }, [])

  useEffect(() => {
    // Mount/param-change data fetch; the synchronous setState in `load` is
    // intentional and mirrors the SavedItinerariesPage pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(idsKey ? idsKey.split(',') : [])
  }, [load, idsKey])

  const present = slots.filter((s): s is Slot & { itinerary: ItineraryResponse } => !s.missing)

  return (
    <Container>
      <Section>
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent-700">
              Side by side
            </p>
            <h1 className="mt-4 font-serif text-5xl font-medium leading-[1.05] tracking-tight text-ink sm:text-6xl">
              Compare trips
            </h1>
            <p className="mt-4 text-lg text-ink-soft">
              Days, budget, and pace lined up so you can pick your next trip.
            </p>
            <Link
              to="/saved"
              className="mt-4 inline-block rounded text-sm font-medium text-accent-600 hover:text-accent-700 hover:underline focus-visible:outline-none"
            >
              ← Back to saved itineraries
            </Link>
          </div>

          {loading ? (
            <div
              className="flex min-h-[30vh] items-center justify-center text-ink-faint"
              aria-busy="true"
              aria-label="Loading trips to compare"
            >
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-ink-line border-t-accent-500 motion-reduce:animate-none" />
            </div>
          ) : ids.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-ink-line bg-canvas-raised p-14 text-center">
              <h2 className="font-serif text-2xl font-medium tracking-tight text-ink">
                No trips selected
              </h2>
              <p className="mt-2 text-ink-soft">
                Pick 2 or 3 saved trips to compare them side by side.
              </p>
              <Link
                to="/saved"
                className="mt-6 inline-block rounded-full bg-accent-500 px-6 py-2.5 text-sm font-medium text-white transition-colors duration-hover hover:bg-accent-600 focus-visible:outline-none"
              >
                Go to saved itineraries
              </Link>
            </div>
          ) : (
            <>
              {/* Summary row: destination, days, budget tier, pace per trip. */}
              <div className="overflow-x-auto">
                <div className="flex min-w-full gap-4" role="group" aria-label="Trip summary">
                  {slots.map((s) =>
                    s.missing || !s.itinerary ? (
                      <MissingColumn key={s.id} id={s.id} />
                    ) : (
                      <div
                        key={s.id}
                        className={`${COLUMN} rounded-2xl border border-ink-line bg-canvas-raised p-6 shadow-frame`}
                      >
                        <p className="font-serif text-2xl font-medium leading-tight tracking-tight text-ink">
                          {s.itinerary.preferences.destination}
                        </p>
                        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <dt className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">
                              Length
                            </dt>
                            <dd className="mt-1 font-medium text-ink">
                              {tripLength(s.itinerary)}{' '}
                              {tripLength(s.itinerary) === 1 ? 'day' : 'days'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">
                              Total
                            </dt>
                            <dd className="mt-1 font-medium tabular-nums text-ink">
                              {money(s.itinerary.total_estimated_cost_usd)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">
                              Style
                            </dt>
                            <dd className="mt-1 font-medium capitalize text-ink">
                              {s.itinerary.preferences.travel_style}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">
                              Pace
                            </dt>
                            <dd className="mt-1 font-medium capitalize text-ink">
                              {s.itinerary.preferences.pace}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    ),
                  )}
                </div>
              </div>

              {/* Columnar cost breakdowns, one per present trip. */}
              {present.length > 0 && (
                <div className="overflow-x-auto">
                  <div className="flex min-w-full gap-4">
                    {present.map((s) => (
                      <div key={s.id} className={COLUMN}>
                        <CostBreakdown itinerary={s.itinerary} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Day-by-day columnar grid. Each trip is a column; rows align by
                  day number so the same day across trips reads across. Stacks
                  vertically on mobile via horizontal scroll of fixed columns. */}
              {present.length > 0 && (
                <div className="overflow-x-auto">
                  <div className="flex min-w-full gap-4">
                    {present.map((s) => (
                      <div key={s.id} className={`${COLUMN} space-y-3`}>
                        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">
                          {s.itinerary.preferences.destination} — day by day
                        </p>
                        {s.itinerary.days.map((d) => (
                          <div
                            key={d.day_number}
                            className="rounded-2xl border border-ink-line bg-canvas-raised p-5 shadow-frame"
                          >
                            <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent-700">
                              Day {d.day_number}
                            </p>
                            <p className="mt-1 font-serif text-lg font-medium tracking-tight text-ink">
                              {d.theme}
                            </p>
                            <ul className="mt-3 space-y-2">
                              {d.activities.map((a, i) => (
                                <li key={i} className="flex justify-between gap-3 text-sm">
                                  <span className="text-ink-soft">
                                    <span className="text-ink-faint">{a.time}</span> {a.place}
                                  </span>
                                  <span className="shrink-0 tabular-nums text-ink-faint">
                                    {money(a.estimated_cost_usd)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Section>
    </Container>
  )
}
