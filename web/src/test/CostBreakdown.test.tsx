import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import CostBreakdown from '../components/CostBreakdown'
import { makeActivity, makeDay, makeItinerary, makePreferences } from './fixtures'

describe('CostBreakdown', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders the grand total summed from all activity costs', () => {
    render(<CostBreakdown itinerary={makeItinerary()} />)
    const heading = screen.getByRole('heading', { name: 'Budget breakdown' })
    const section = heading.closest('section') as HTMLElement
    // Default fixture: day1 (0+40) + day2 (15) = $55.
    expect(within(section).getAllByText(/\$55/).length).toBeGreaterThan(0)
  })

  it('reports "under budget" when spend is below the preference budget', () => {
    const it = makeItinerary({ preferences: makePreferences({ budget_usd: 2000 }) })
    render(<CostBreakdown itinerary={it} />)
    // 2000 - 55 = $1,945 under budget.
    expect(screen.getByText(/\$1,945 under budget/)).toBeInTheDocument()
  })

  it('reports "over budget" when spend exceeds the budget', () => {
    const it = makeItinerary({
      preferences: makePreferences({ budget_usd: 30 }),
    })
    render(<CostBreakdown itinerary={it} />)
    expect(screen.getByText(/over budget/)).toBeInTheDocument()
  })

  it('omits the budget block entirely when budget is zero', () => {
    const it = makeItinerary({ preferences: makePreferences({ budget_usd: 0 }) })
    render(<CostBreakdown itinerary={it} />)
    expect(screen.queryByText('Your budget')).not.toBeInTheDocument()
  })

  it('labels the stacked category bar with the spend mix for screen readers', () => {
    render(<CostBreakdown itinerary={makeItinerary()} />)
    const bar = screen.getByRole('img', { name: /Spend by category/ })
    // Food ($40) and Attractions ($15) are the only non-zero categories.
    expect(bar).toHaveAccessibleName(/Food & drink/)
    expect(bar).toHaveAccessibleName(/Attractions/)
  })

  it('shows the per-day chart only when the trip spans more than one day', () => {
    render(<CostBreakdown itinerary={makeItinerary()} />)
    expect(screen.getByText('Spend per day')).toBeInTheDocument()

    const single = makeItinerary({
      days: [makeDay({ activities: [makeActivity({ estimated_cost_usd: 20 })] })],
    })
    render(<CostBreakdown itinerary={single} />)
    // Still exactly one occurrence (from the first, multi-day render).
    expect(screen.getAllByText('Spend per day')).toHaveLength(1)
  })

  it('computes the trip-length summary (days + per-day average)', () => {
    render(<CostBreakdown itinerary={makeItinerary()} />)
    expect(screen.getByText('2 days')).toBeInTheDocument()
    // 55 / 2 days, rounded -> $28.
    expect(screen.getByText('$28')).toBeInTheDocument()
  })
})
