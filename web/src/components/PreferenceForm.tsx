import { useState } from 'react'
import type {
  Pace,
  TravelPreferences,
  TravelStyle,
} from '../types/itinerary'

interface PreferenceFormProps {
  onSubmit: (prefs: TravelPreferences) => void
  submitting?: boolean
}

const INTEREST_OPTIONS = [
  'Food',
  'History',
  'Nature',
  'Art',
  'Nightlife',
  'Shopping',
  'Adventure',
  'Wellness',
  'Architecture',
  'Sports',
]

const DIETARY_OPTIONS = ['Vegetarian', 'Vegan', 'Gluten-free', 'Halal', 'Kosher', 'None']
const ACCESSIBILITY_OPTIONS = ['Wheelchair', 'Limited mobility', 'Visual', 'Hearing', 'None']

const TRAVEL_STYLES: { value: TravelStyle; label: string; hint: string }[] = [
  { value: 'budget', label: 'Budget', hint: 'Hostels, street food, free sights' },
  { value: 'midrange', label: 'Mid-range', hint: '3-star hotels, casual dining' },
  { value: 'luxury', label: 'Luxury', hint: 'Premium stays, fine dining' },
]

const PACES: { value: Pace; label: string; hint: string }[] = [
  { value: 'relaxed', label: 'Relaxed', hint: 'Few activities, lots of downtime' },
  { value: 'moderate', label: 'Moderate', hint: 'A balanced mix each day' },
  { value: 'packed', label: 'Packed', hint: 'See as much as possible' },
]

const TOTAL_STEPS = 4

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

interface CustomNeedsFieldProps {
  /** Human label for the kind of need, e.g. "dietary need" — used in aria text. */
  noun: string
  /** The curated options shown as checkboxes; anything else counts as custom. */
  curated: string[]
  /** The full selected list (curated + custom) for this need. */
  selected: string[]
  onChange: (next: string[]) => void
}

/**
 * Free-text escape hatch for the curated checkbox lists. The backend accepts
 * arbitrary strings for ``dietary_needs`` / ``accessibility_needs``, so this lets
 * a user add anything the curated list doesn't cover (e.g. "shellfish allergy").
 * Custom entries are rendered as removable chips; values already present in the
 * curated list are filtered out here so they stay owned by the checkboxes above.
 */
function CustomNeedsField({ noun, curated, selected, onChange }: CustomNeedsFieldProps) {
  const [draft, setDraft] = useState('')
  const customValues = selected.filter((v) => !curated.includes(v))

  function add() {
    const value = draft.trim()
    if (!value) return
    if (!selected.includes(value)) onChange([...selected, value])
    setDraft('')
  }

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          aria-label={`Add a custom ${noun}`}
          placeholder={`Add another ${noun}…`}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="button"
          onClick={add}
          className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          Add
        </button>
      </div>
      {customValues.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {customValues.map((value) => (
            <li key={value}>
              <span className="inline-flex items-center gap-1 rounded-full border border-brand-500 bg-brand-50 py-1 pl-3 pr-1 text-sm text-slate-700">
                {value}
                <button
                  type="button"
                  onClick={() => onChange(selected.filter((v) => v !== value))}
                  aria-label={`Remove ${value}`}
                  className="rounded-full px-1.5 text-slate-500 transition hover:bg-brand-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function PreferenceForm({ onSubmit, submitting }: PreferenceFormProps) {
  const [step, setStep] = useState(1)

  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState(today())
  const [budget, setBudget] = useState(2000)
  const [groupSize, setGroupSize] = useState(2)
  const [travelStyle, setTravelStyle] = useState<TravelStyle>('midrange')
  const [pace, setPace] = useState<Pace>('moderate')
  const [interests, setInterests] = useState<string[]>([])
  const [dietary, setDietary] = useState<string[]>([])
  const [accessibility, setAccessibility] = useState<string[]>([])
  const [notes, setNotes] = useState('')

  const [stepError, setStepError] = useState<string | null>(null)

  function validateStep1(): string | null {
    if (!destination.trim()) return 'Please enter a destination.'
    if (!startDate || !endDate) return 'Please choose start and end dates.'
    if (endDate < startDate) return 'End date must be on or after the start date.'
    return null
  }

  function next() {
    if (step === 1) {
      const err = validateStep1()
      if (err) {
        setStepError(err)
        return
      }
    }
    setStepError(null)
    setStep((s) => Math.min(TOTAL_STEPS, s + 1))
  }

  function back() {
    setStepError(null)
    setStep((s) => Math.max(1, s - 1))
  }

  function handleGenerate() {
    const err = validateStep1()
    if (err) {
      setStep(1)
      setStepError(err)
      return
    }
    const prefs: TravelPreferences = {
      destination: destination.trim(),
      start_date: startDate,
      end_date: endDate,
      budget_usd: budget,
      interests: interests.map((i) => i.toLowerCase()),
      pace,
      travel_style: travelStyle,
      dietary_needs: dietary,
      accessibility_needs: accessibility,
      group_size: groupSize,
      notes: notes.trim() ? notes.trim() : null,
    }
    onSubmit(prefs)
  }

  const progress = (step / TOTAL_STEPS) * 100

  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-md sm:p-8">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-sm font-medium text-slate-600">
          <span>
            Step {step} of {TOTAL_STEPS}
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {step === 1 && (
        <section className="space-y-5">
          <h2 className="text-xl font-semibold text-slate-800">Where & when?</h2>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Destination</label>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. Tokyo, Japan"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">End date</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-6">
          <h2 className="text-xl font-semibold text-slate-800">Budget & group</h2>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700">Budget (per person)</label>
              <span className="font-semibold text-brand-700">${budget.toLocaleString()}</span>
            </div>
            <input
              type="range"
              min={100}
              max={10000}
              step={100}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="w-full accent-brand-600"
            />
            <div className="flex justify-between text-xs text-slate-500">
              <span>$100</span>
              <span>$10,000</span>
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700">Group size</label>
              <span className="font-semibold text-brand-700">
                {groupSize} {groupSize === 1 ? 'traveler' : 'travelers'}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={groupSize}
              onChange={(e) => setGroupSize(Number(e.target.value))}
              className="w-full accent-brand-600"
            />
            <div className="flex justify-between text-xs text-slate-500">
              <span>1</span>
              <span>20</span>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Travel style</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {TRAVEL_STYLES.map((opt) => (
                <label
                  key={opt.value}
                  className={`relative cursor-pointer rounded-lg border p-3 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${
                    travelStyle === opt.value
                      ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100'
                      : 'border-slate-300 hover:border-slate-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="travel_style"
                    value={opt.value}
                    checked={travelStyle === opt.value}
                    onChange={() => setTravelStyle(opt.value)}
                    className="sr-only"
                  />
                  {travelStyle === opt.value && (
                    <span
                      aria-hidden="true"
                      className="absolute right-2 top-2 text-brand-600"
                    >
                      ✓
                    </span>
                  )}
                  <span className="block font-semibold text-slate-800">{opt.label}</span>
                  <span className="mt-1 block text-xs text-slate-500">{opt.hint}</span>
                </label>
              ))}
            </div>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-6">
          <h2 className="text-xl font-semibold text-slate-800">Pace & interests</h2>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Pace</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {PACES.map((opt) => (
                <label
                  key={opt.value}
                  className={`relative cursor-pointer rounded-lg border p-3 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${
                    pace === opt.value
                      ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100'
                      : 'border-slate-300 hover:border-slate-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="pace"
                    value={opt.value}
                    checked={pace === opt.value}
                    onChange={() => setPace(opt.value)}
                    className="sr-only"
                  />
                  {pace === opt.value && (
                    <span aria-hidden="true" className="absolute right-2 top-2 text-brand-600">
                      ✓
                    </span>
                  )}
                  <span className="block font-semibold text-slate-800">{opt.label}</span>
                  <span className="mt-1 block text-xs text-slate-500">{opt.hint}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Interests</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {INTEREST_OPTIONS.map((opt) => {
                const checked = interests.includes(opt)
                return (
                  <label
                    key={opt}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                      checked
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setInterests((cur) => toggle(cur, opt))}
                      className="accent-brand-600"
                    />
                    <span className="text-slate-700">{opt}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-6">
          <h2 className="text-xl font-semibold text-slate-800">Needs & notes</h2>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Dietary needs</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DIETARY_OPTIONS.map((opt) => {
                const checked = dietary.includes(opt)
                return (
                  <label
                    key={opt}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                      checked
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setDietary((cur) => toggle(cur, opt))}
                      className="accent-brand-600"
                    />
                    <span className="text-slate-700">{opt}</span>
                  </label>
                )
              })}
            </div>
            <CustomNeedsField
              noun="dietary need"
              curated={DIETARY_OPTIONS}
              selected={dietary}
              onChange={setDietary}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Accessibility needs</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ACCESSIBILITY_OPTIONS.map((opt) => {
                const checked = accessibility.includes(opt)
                return (
                  <label
                    key={opt}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                      checked
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setAccessibility((cur) => toggle(cur, opt))}
                      className="accent-brand-600"
                    />
                    <span className="text-slate-700">{opt}</span>
                  </label>
                )
              })}
            </div>
            <CustomNeedsField
              noun="accessibility need"
              curated={ACCESSIBILITY_OPTIONS}
              selected={accessibility}
              onChange={setAccessibility}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything else we should know? e.g. traveling with kids, prefer mornings free..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </section>
      )}

      {stepError && (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{stepError}</p>
      )}

      {/* Controls */}
      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={back}
          disabled={step === 1 || submitting}
          className="rounded-lg border border-slate-300 px-5 py-2 font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back
        </button>

        {step < TOTAL_STEPS ? (
          <button
            type="button"
            onClick={next}
            className="rounded-lg bg-brand-600 px-6 py-2 font-medium text-white transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={submitting}
            className="rounded-lg bg-brand-600 px-6 py-2 font-medium text-white transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Generating…' : 'Generate itinerary'}
          </button>
        )}
      </div>
    </div>
  )
}
