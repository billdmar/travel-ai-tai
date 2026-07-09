import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ApiError, createItinerary, regenerateItinerary } from '../api/client'
import type { PlanLocationState } from '../types/discovery'
import type { Pace, TravelPreferences, TravelStyle } from '../types/itinerary'

/**
 * Router state for "Adjust trip": the source trip's id plus its current
 * preferences. When present the form pre-fills from these prefs and submitting
 * calls ``regenerateItinerary`` (a new trip from the source) instead of
 * ``createItinerary``. Carried alongside {@link PlanLocationState}, so a caller
 * (e.g. the itinerary view) opens ``/plan/:destination`` with ``{ adjust }``.
 */
interface AdjustLocationState {
  adjust?: { sourceId: string; preferences: TravelPreferences }
}
import {
  Button,
  Container,
  Reveal,
  ScrollScale,
  Section,
  softGlow,
  variableSerif,
} from '../components/ui'

const PACES: { value: Pace; label: string }[] = [
  { value: 'relaxed', label: 'Relaxed' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'packed', label: 'Packed' },
]

const STYLES: { value: TravelStyle; label: string }[] = [
  { value: 'budget', label: 'Budget' },
  { value: 'midrange', label: 'Midrange' },
  { value: 'luxury', label: 'Luxury' },
]

// Default the trip to a near-future week so the form is usable immediately
// without forcing a date pick. (Static offsets — no Date.now at module load.)
function defaultDates(): { start: string; end: string } {
  const base = new Date()
  base.setDate(base.getDate() + 30)
  const start = base.toISOString().slice(0, 10)
  base.setDate(base.getDate() + 4)
  const end = base.toISOString().slice(0, 10)
  return { start, end }
}

export default function TripDetailsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const state = location.state as (PlanLocationState & AdjustLocationState) | null

  // In adjust mode the source trip's preferences seed every field, so the user
  // tweaks a known starting point rather than a blank form.
  const adjust = state?.adjust ?? null
  const seed = adjust?.preferences ?? null

  const destination =
    seed?.destination ??
    state?.recommendation?.name ??
    (params.destination ? decodeURIComponent(params.destination) : '')
  const interests = seed?.interests ?? state?.hobbies ?? []

  const initialDates = defaultDates()
  const [startDate, setStartDate] = useState(seed?.start_date ?? initialDates.start)
  const [endDate, setEndDate] = useState(seed?.end_date ?? initialDates.end)
  const [budget, setBudget] = useState(seed?.budget_usd ?? 1500)
  const [groupSize, setGroupSize] = useState(seed?.group_size ?? 2)
  const [pace, setPace] = useState<Pace>(seed?.pace ?? 'moderate')
  const [style, setStyle] = useState<TravelStyle>(seed?.travel_style ?? 'midrange')
  const [notes, setNotes] = useState(seed?.notes ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const datesValid = startDate <= endDate
  const canSubmit = destination.trim().length > 0 && datesValid && !loading

  const handleSubmit = async () => {
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    const prefs: TravelPreferences = {
      destination,
      start_date: startDate,
      end_date: endDate,
      budget_usd: budget,
      interests,
      pace,
      travel_style: style,
      // Carry dietary/accessibility needs through an adjust (the form has no
      // controls for them); fresh plans start empty as before.
      dietary_needs: seed?.dietary_needs ?? [],
      accessibility_needs: seed?.accessibility_needs ?? [],
      group_size: groupSize,
      notes: notes.trim() || null,
    }
    try {
      const itinerary = adjust
        ? await regenerateItinerary(adjust.sourceId, prefs)
        : await createItinerary(prefs)
      navigate(`/itinerary/${encodeURIComponent(itinerary.id)}`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('Too many requests right now — please try again in a moment.')
      } else if (err instanceof ApiError && err.status === 503) {
        setError('The planning service is briefly unavailable. Please try again.')
      } else if (err instanceof ApiError && err.status === 422) {
        setError('Some details need adjusting — please review your dates and budget.')
      } else {
        setError('Something went wrong building your itinerary. Please try again.')
      }
      setLoading(false)
    }
  }

  return (
    <Section size="cozy" className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={softGlow('top-left')}
      />
      <Container narrow>
        <Reveal>
          {state?.recommendation ? (
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent-700">
              {state.recommendation.country}
            </p>
          ) : null}
          <h1
            className="mt-4 font-serif text-5xl font-medium leading-[1.05] tracking-tight text-ink sm:text-6xl"
            style={variableSerif(560)}
          >
            {adjust ? 'Adjust your trip to ' : 'Your trip to '}
            {destination || 'somewhere wonderful'}
          </h1>
          {interests.length > 0 ? (
            <p className="mt-4 text-ink-soft">
              Tuned to{' '}
              <span className="text-ink">{interests.join(', ').toLowerCase()}</span>.
            </p>
          ) : null}
        </Reveal>

        <Reveal index={1}>
          <ScrollScale amount={0.03}>
          <div className="mt-10 space-y-8 rounded-3xl border border-ink-line bg-canvas-raised p-7 shadow-frame">
            {/* Dates */}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Start date">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="End date">
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
            {!datesValid ? (
              <p role="alert" className="-mt-4 text-sm text-red-700">
                End date must be on or after the start date.
              </p>
            ) : null}

            {/* Budget + group */}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={`Budget — $${budget.toLocaleString()} USD`}>
                <input
                  type="range"
                  min={250}
                  max={20000}
                  step={250}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="mt-3 w-full accent-accent-500"
                />
              </Field>
              <Field label="Group size">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={groupSize}
                  onChange={(e) =>
                    setGroupSize(Math.max(1, Number(e.target.value) || 1))
                  }
                  className={inputCls}
                />
              </Field>
            </div>

            {/* Pace */}
            <Field label="Pace">
              <SegmentedControl
                options={PACES}
                value={pace}
                onChange={setPace}
              />
            </Field>

            {/* Style */}
            <Field label="Travel style">
              <SegmentedControl
                options={STYLES}
                value={style}
                onChange={setStyle}
              />
            </Field>

            {/* Notes */}
            <Field label="Notes (optional)">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Dietary needs, accessibility, must-sees…"
                className={`${inputCls} resize-none`}
              />
            </Field>
          </div>
          </ScrollScale>
        </Reveal>

        {error ? (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}

        <Reveal index={2}>
          <div className="mt-8">
            <Button onClick={handleSubmit} size="lg" disabled={!canSubmit}>
              {loading
                ? 'Building your itinerary…'
                : adjust
                  ? 'Regenerate my trip →'
                  : 'Build my itinerary →'}
            </Button>
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}

const inputCls =
  'w-full rounded-xl border border-ink-line bg-canvas px-4 py-2.5 text-ink placeholder:text-ink-faint focus:border-accent-400 focus:outline-none'

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  )
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="mt-2 inline-flex rounded-xl border border-ink-line bg-canvas p-1">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-accent-500 text-white'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
