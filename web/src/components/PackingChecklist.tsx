import { useMemo, useState } from 'react'
import type { ActivityCategory, ItineraryResponse } from '../types/itinerary'

interface PackingChecklistProps {
  itinerary: ItineraryResponse
}

interface ChecklistGroup {
  title: string
  items: string[]
}

/** Rough hemisphere-agnostic season label from a YYYY-MM-DD start date. */
function seasonFromDate(isoDate: string): 'spring' | 'summer' | 'autumn' | 'winter' | null {
  const m = Number(isoDate.slice(5, 7))
  if (!m || Number.isNaN(m)) return null
  if (m >= 3 && m <= 5) return 'spring'
  if (m >= 6 && m <= 8) return 'summer'
  if (m >= 9 && m <= 11) return 'autumn'
  return 'winter'
}

/**
 * Builds a deterministic packing list from the itinerary's preferences and the
 * mix of activity categories. Pure logic — no network, no randomness — so the
 * same trip always yields the same list (and tests stay stable).
 */
function buildChecklist(itinerary: ItineraryResponse): ChecklistGroup[] {
  const { preferences, days } = itinerary
  const categories = new Set<ActivityCategory>()
  for (const d of days) for (const a of d.activities) categories.add(a.category)

  const essentials = [
    'Passport / ID and travel documents',
    'Phone, charger and a power bank',
    'Payment cards and a little local cash',
    'Reusable water bottle',
  ]
  if (preferences.group_size > 1) essentials.push('Shared copies of bookings for the group')

  const clothing: string[] = ['Comfortable walking shoes', 'Day bag or small backpack']
  const season = seasonFromDate(preferences.start_date)
  if (season === 'summer') clothing.push('Light, breathable layers', 'Sun hat and sunglasses')
  if (season === 'winter') clothing.push('Warm coat and thermal layers', 'Gloves, hat and scarf')
  if (season === 'spring' || season === 'autumn')
    clothing.push('Light jacket and a packable rain layer')
  if (preferences.travel_style === 'luxury')
    clothing.push('A smart outfit for upscale dining or venues')

  const healthAndComfort = ['Any personal medications', 'Sunscreen', 'Reusable mask / hand sanitiser']
  for (const need of preferences.accessibility_needs)
    healthAndComfort.push(`Accessibility: ${need}`)

  const byActivity: string[] = []
  if (categories.has('attraction')) byActivity.push('Camera and tickets / passes for attractions')
  if (categories.has('leisure')) byActivity.push('Swimwear and a quick-dry towel')
  if (categories.has('food')) byActivity.push('Reservation confirmations for dining')
  if (categories.has('transport')) byActivity.push('Transit passes and offline maps')
  if (categories.has('accommodation')) byActivity.push('Earplugs and a sleep mask')
  for (const diet of preferences.dietary_needs)
    byActivity.push(`Dietary note to show: ${diet}`)

  const groups: ChecklistGroup[] = [
    { title: 'Essentials', items: essentials },
    { title: 'Clothing', items: clothing },
    { title: 'Health & comfort', items: healthAndComfort },
  ]
  if (byActivity.length > 0) groups.push({ title: 'For your activities', items: byActivity })
  return groups
}

/**
 * Interactive, auto-generated packing checklist. State is local (in-memory)
 * checked toggles — intentionally not persisted, matching the app's ephemeral
 * preference model. Collapsible to keep the itinerary page calm by default.
 */
export default function PackingChecklist({ itinerary }: PackingChecklistProps) {
  const groups = useMemo(() => buildChecklist(itinerary), [itinerary])
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  const total = groups.reduce((s, g) => s + g.items.length, 0)
  const done = Object.values(checked).filter(Boolean).length

  return (
    <section
      aria-labelledby="packing-heading"
      className="overflow-hidden rounded-2xl border border-ink-line bg-canvas-raised shadow-frame"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors duration-hover hover:bg-canvas-sunken/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500"
      >
        <div>
          <h3
            id="packing-heading"
            className="font-serif text-2xl font-medium leading-tight tracking-tight text-ink"
          >
            Packing checklist
          </h3>
          <p className="mt-0.5 text-sm text-ink-faint">
            {done} of {total} packed · tailored to your trip
          </p>
        </div>
        <svg
          aria-hidden="true"
          className={`h-5 w-5 shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="grid gap-6 border-t border-ink-line px-6 py-6 sm:grid-cols-2">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                {group.title}
              </p>
              <ul className="space-y-2">
                {group.items.map((item) => {
                  const key = `${group.title}::${item}`
                  const isChecked = !!checked[key]
                  return (
                    <li key={key}>
                      <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed text-ink-soft">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() =>
                            setChecked((c) => ({ ...c, [key]: !c[key] }))
                          }
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-line text-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                        />
                        <span className={isChecked ? 'text-ink-faint line-through' : ''}>
                          {item}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
