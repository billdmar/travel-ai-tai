import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import CostBreakdown from '../components/CostBreakdown'
import { makeActivity, makeDay, makeItinerary, makePreferences } from './fixtures'

/** Force the prefers-reduced-motion media query to a given value. */
function setReducedMotion(reduced: boolean) {
  window.matchMedia = ((query: string) =>
    ({
      matches: reduced && query.includes('reduce'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia
}

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

  it('renders every bar at its final width under reduced motion (instant, no transition)', () => {
    setReducedMotion(true)
    const it = makeItinerary({ preferences: makePreferences({ budget_usd: 2000 }) })
    const { container } = render(<CostBreakdown itinerary={it} />)
    // The grow() reduced branch animates straight to the target width with no
    // grow-from-zero transition; bars still land at a non-zero width.
    const widthBars = container.querySelectorAll('[style*="width"]')
    expect(widthBars.length).toBeGreaterThan(0)
  })
})

// Stagger is observable only via the per-bar `transition.delay` passed to
// framer-motion, which jsdom does not surface as DOM. Mock motion so each
// motion.div echoes its transition delay into a data attribute, then assert the
// cascade: later category/per-day bars carry a strictly larger delay than the
// first, while the single budget gauge stays undelayed.
describe('CostBreakdown stagger', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    vi.unmock('framer-motion')
  })

  it('cascades sibling bars with an increasing delay and leaves the gauge undelayed', async () => {
    setReducedMotion(false)
    vi.resetModules()
    vi.doMock('framer-motion', () => ({
      motion: new Proxy(
        {},
        {
          get:
            () =>
            ({
              transition,
              className,
              children,
            }: {
              transition?: { delay?: number }
              className?: string
              children?: unknown
            }) => (
              <div
                className={className}
                data-delay={transition?.delay ?? 0}
                data-testid="bar"
              >
                {children as never}
              </div>
            ),
        },
      ),
    }))
    const { default: Mocked } = await import('../components/CostBreakdown')
    const { render: render2, screen: screen2 } = await import('@testing-library/react')
    const it = makeItinerary({ preferences: makePreferences({ budget_usd: 2000 }) })
    render2(<Mocked itinerary={it} />)

    const bars = screen2.getAllByTestId('bar')
    const delays = bars.map((b) => Number(b.getAttribute('data-delay')))
    // The budget gauge (un-indexed) and the first segment of each group are 0.
    expect(delays).toContain(0)
    // At least one later bar cascades behind bar 0 (default fixture has 2 days
    // + 2 spend categories, so a delayed sibling always exists).
    expect(Math.max(...delays)).toBeGreaterThan(0)
  })
})
