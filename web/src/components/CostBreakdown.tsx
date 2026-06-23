import { useMemo } from 'react'
import { motion } from 'framer-motion'
import type { ActivityCategory, ItineraryResponse } from '../types/itinerary'
import { money } from '../lib/format'
import { usePrefersReducedMotion } from './ui'
import { durationSeconds, easeLux } from './ui/motionTokens'

interface CostBreakdownProps {
  itinerary: ItineraryResponse
}

// Ordered so the stacked bar reads predictably; the accent marks the single
// "attraction" category (one-accent rule), the rest are quiet ink tones.
const CATEGORY_ORDER: ActivityCategory[] = [
  'accommodation',
  'food',
  'attraction',
  'transport',
  'leisure',
  'other',
]

const CATEGORY_LABEL: Record<ActivityCategory, string> = {
  accommodation: 'Accommodation',
  food: 'Food & drink',
  attraction: 'Attractions',
  transport: 'Transport',
  leisure: 'Leisure',
  other: 'Other',
}

// Fill colors for the stacked bar + legend swatches. Single accent for the
// headline category; the rest are graded ink neutrals so the chart stays calm.
const CATEGORY_FILL: Record<ActivityCategory, string> = {
  accommodation: 'bg-ink',
  food: 'bg-ink-soft',
  attraction: 'bg-accent-500',
  transport: 'bg-ink-faint',
  leisure: 'bg-ink-line',
  other: 'bg-canvas-sunken',
}

/**
 * Budget breakdown: a single stacked bar split by spend category, a per-day
 * mini bar chart, and a trip-length / pace / budget-fit summary. Reuses the
 * itinerary's own activity costs — no new data required.
 */
export default function CostBreakdown({ itinerary }: CostBreakdownProps) {
  const reduced = usePrefersReducedMotion()
  const { days, preferences, currency } = itinerary

  const { byCategory, perDay, grandTotal, maxDay } = useMemo(() => {
    const cat: Record<ActivityCategory, number> = {
      food: 0,
      attraction: 0,
      transport: 0,
      accommodation: 0,
      leisure: 0,
      other: 0,
    }
    const perDay = days.map((d) => {
      const dayTotal = d.activities.reduce((s, a) => {
        cat[a.category] += a.estimated_cost_usd
        return s + a.estimated_cost_usd
      }, 0)
      return { dayNumber: d.day_number, theme: d.theme, total: dayTotal }
    })
    const grandTotal = perDay.reduce((s, d) => s + d.total, 0)
    const maxDay = perDay.reduce((m, d) => Math.max(m, d.total), 0)
    const byCategory = CATEGORY_ORDER.map((c) => ({
      category: c,
      amount: cat[c],
      pct: grandTotal > 0 ? (cat[c] / grandTotal) * 100 : 0,
    })).filter((c) => c.amount > 0)
    return { byCategory, perDay, grandTotal, maxDay }
  }, [days])

  const budget = preferences.budget_usd
  const overBudget = budget > 0 && grandTotal > budget
  const budgetPct = budget > 0 ? Math.min(100, (grandTotal / budget) * 100) : 0
  const dayCount = days.length

  const grow = (target: string) =>
    reduced
      ? { initial: false as const, animate: { width: target } }
      : {
          initial: { width: 0 },
          animate: { width: target },
          transition: { duration: durationSeconds('reveal'), ease: easeLux() },
        }

  return (
    <section
      aria-labelledby="cost-breakdown-heading"
      className="rounded-2xl border border-ink-line bg-canvas-raised p-6 shadow-frame sm:p-7"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3
            id="cost-breakdown-heading"
            className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-faint"
          >
            Budget breakdown
          </h3>
          <p className="mt-2 font-serif text-3xl font-medium tabular-nums text-ink">
            {money(grandTotal)}{' '}
            <span className="text-sm font-normal text-ink-faint">{currency}</span>
          </p>
        </div>
        {budget > 0 && (
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">Your budget</p>
            <p className="mt-1 text-sm font-medium tabular-nums text-ink-soft">{money(budget)}</p>
            <p
              className={`mt-0.5 text-xs font-medium ${overBudget ? 'text-orange-700' : 'text-accent-700'}`}
            >
              {overBudget
                ? `${money(grandTotal - budget)} over budget`
                : `${money(budget - grandTotal)} under budget`}
            </p>
          </div>
        )}
      </div>

      {/* Budget-fit gauge */}
      {budget > 0 && (
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-canvas-sunken">
            <motion.div
              className={`h-full rounded-full ${overBudget ? 'bg-orange-400' : 'bg-accent-400'}`}
              {...grow(`${budgetPct}%`)}
            />
          </div>
        </div>
      )}

      {/* Stacked category bar */}
      {byCategory.length > 0 && (
        <div className="mt-6">
          <div
            className="flex h-3 w-full overflow-hidden rounded-full ring-1 ring-ink-line"
            role="img"
            aria-label={`Spend by category: ${byCategory
              .map((c) => `${CATEGORY_LABEL[c.category]} ${Math.round(c.pct)}%`)
              .join(', ')}`}
          >
            {byCategory.map((c) => (
              <motion.div
                key={c.category}
                className={`h-full ${CATEGORY_FILL[c.category]}`}
                {...grow(`${c.pct}%`)}
              />
            ))}
          </div>

          {/* Legend */}
          <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {byCategory.map((c) => (
              <li key={c.category} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 text-ink-soft">
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-ink-line ${CATEGORY_FILL[c.category]}`}
                  />
                  {CATEGORY_LABEL[c.category]}
                </span>
                <span className="tabular-nums text-ink-faint">
                  {money(c.amount)} · {Math.round(c.pct)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Per-day bars */}
      {perDay.length > 1 && (
        <div className="mt-7">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">
            Spend per day
          </p>
          <ul className="space-y-2.5">
            {perDay.map((d) => (
              <li key={d.dayNumber} className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-xs font-medium text-ink-faint">
                  Day {d.dayNumber}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas-sunken">
                  <motion.div
                    className="h-full rounded-full bg-accent-400"
                    {...grow(`${maxDay > 0 ? (d.total / maxDay) * 100 : 0}%`)}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-ink-soft">
                  {money(d.total)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Trip-length & pace summary */}
      <dl className="mt-7 grid grid-cols-2 gap-4 border-t border-ink-line pt-5 sm:grid-cols-4">
        <div>
          <dt className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">Length</dt>
          <dd className="mt-1 font-serif text-xl font-medium text-ink">
            {dayCount} {dayCount === 1 ? 'day' : 'days'}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">Pace</dt>
          <dd className="mt-1 font-serif text-xl font-medium capitalize text-ink">
            {preferences.pace}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">Style</dt>
          <dd className="mt-1 font-serif text-xl font-medium capitalize text-ink">
            {preferences.travel_style}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">Per day</dt>
          <dd className="mt-1 font-serif text-xl font-medium tabular-nums text-ink">
            {money(dayCount > 0 ? Math.round(grandTotal / dayCount) : 0)}
          </dd>
        </div>
      </dl>
    </section>
  )
}
