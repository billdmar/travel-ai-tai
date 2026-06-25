import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DayCard from '../components/DayCard'
import { makeActivity, makeDay, stubImageFetch } from './fixtures'

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

describe('DayCard', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders the day header (number, theme, date) and is collapsed by default', () => {
    stubImageFetch()
    render(<DayCard day={makeDay()} />)
    expect(screen.getByRole('button', { name: /Temples & tea/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.getByText('2026-07-01')).toBeInTheDocument()
    // Activities are hidden while collapsed.
    expect(screen.queryByText('Fushimi Inari Shrine')).not.toBeInTheDocument()
  })

  it('expands to reveal the activities when the header is clicked', async () => {
    stubImageFetch()
    const user = userEvent.setup()
    render(<DayCard day={makeDay()} />)
    await user.click(screen.getByRole('button', { name: /Temples & tea/ }))
    expect(screen.getByRole('button', { name: /Temples & tea/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    // place renders once per layout (mobile list + sm table) — assert presence.
    expect(screen.getAllByText('Fushimi Inari Shrine').length).toBeGreaterThan(0)
  })

  it('renders the day subtotal from the activity costs', () => {
    stubImageFetch()
    // 0 + 40 = $40 for the default day.
    render(<DayCard day={makeDay()} defaultOpen />)
    expect(screen.getAllByText('$40').length).toBeGreaterThan(0)
  })

  it('shows a Map link only for activities that carry a map_url', () => {
    stubImageFetch()
    const day = makeDay({
      activities: [
        makeActivity({ place: 'Has Map', map_url: 'https://maps.example/x' }),
        makeActivity({ place: 'No Map', map_url: '' }),
      ],
    })
    render(<DayCard day={day} defaultOpen />)
    // One mapped activity -> one map affordance per layout (mobile + table).
    const mapLinks = screen.getAllByRole('link', { name: /Open Has Map in Google Maps/ })
    expect(mapLinks.length).toBeGreaterThan(0)
    expect(
      screen.queryByRole('link', { name: /Open No Map in Google Maps/ }),
    ).not.toBeInTheDocument()
  })

  it('renders a Book link only when an activity has a booking_url', () => {
    stubImageFetch()
    const day = makeDay({
      activities: [
        makeActivity({ place: 'Bookable', booking_url: 'https://book.example/y' }),
      ],
    })
    render(<DayCard day={day} defaultOpen />)
    const bookLinks = screen.getAllByRole('link', { name: /Book Bookable/ })
    expect(bookLinks[0]).toHaveAttribute('href', 'https://book.example/y')
    expect(bookLinks[0]).toHaveAttribute('target', '_blank')
  })

  it('draws the per-day cost-share bar only when grandTotal is provided', () => {
    stubImageFetch()
    const { container, rerender } = render(<DayCard day={makeDay()} grandTotal={80} />)
    // 40 of 80 -> 50% width on the accent bar.
    expect(container.querySelector('[style*="width: 50%"]')).not.toBeNull()
    rerender(<DayCard day={makeDay()} />)
    expect(container.querySelector('[style*="width:"]')).toBeNull()
  })

  it('shows no edit controls unless editing is true', () => {
    stubImageFetch()
    render(<DayCard day={makeDay()} defaultOpen />)
    expect(
      screen.queryByRole('button', { name: /Remove Fushimi Inari Shrine/ }),
    ).not.toBeInTheDocument()
  })

  it('renders keyboard-accessible reorder + remove buttons while editing', () => {
    stubImageFetch()
    render(<DayCard day={makeDay()} defaultOpen editing onReorder={vi.fn()} onRemove={vi.fn()} />)
    // The two-activity default day: first row cannot move up, last cannot move down.
    const upFirst = screen.getAllByRole('button', { name: /Move Fushimi Inari Shrine up/ })
    expect(upFirst[0]).toBeDisabled()
    const downLast = screen.getAllByRole('button', { name: /Move Nishiki Market down/ })
    expect(downLast[0]).toBeDisabled()
    expect(
      screen.getAllByRole('button', { name: /Remove Fushimi Inari Shrine/ }).length,
    ).toBeGreaterThan(0)
  })

  it('calls onRemove with the activity index', async () => {
    stubImageFetch()
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<DayCard day={makeDay()} defaultOpen editing onRemove={onRemove} onReorder={vi.fn()} />)
    // Click the first (mobile-layout) Remove button for the second activity.
    await user.click(screen.getAllByRole('button', { name: /Remove Nishiki Market/ })[0])
    expect(onRemove).toHaveBeenCalledWith(1)
  })

  it('calls onReorder to move an activity down', async () => {
    stubImageFetch()
    const user = userEvent.setup()
    const onReorder = vi.fn()
    render(<DayCard day={makeDay()} defaultOpen editing onReorder={onReorder} onRemove={vi.fn()} />)
    await user.click(screen.getAllByRole('button', { name: /Move Fushimi Inari Shrine down/ })[0])
    expect(onReorder).toHaveBeenCalledWith(0, 1)
  })

  it('toggles the panel instantly with no height animation under reduced motion', async () => {
    setReducedMotion(true)
    stubImageFetch()
    const user = userEvent.setup()
    const { container } = render(<DayCard day={makeDay()} />)

    // Collapsed: the activities are not in the DOM at all.
    expect(screen.queryByText('Fushimi Inari Shrine')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Temples & tea/ }))

    // Expanded instantly: content present, and the reduced-motion branch mounts
    // the bare panel with no AnimatePresence wrapper — so no inline height /
    // overflow:hidden animation style is applied anywhere in the subtree.
    expect(screen.getAllByText('Fushimi Inari Shrine').length).toBeGreaterThan(0)
    expect(container.querySelector('[style*="height"]')).toBeNull()
    expect(container.querySelector('[style*="overflow: hidden"]')).toBeNull()

    // Collapse is equally instant — the panel unmounts immediately.
    await user.click(screen.getByRole('button', { name: /Temples & tea/ }))
    expect(screen.queryByText('Fushimi Inari Shrine')).not.toBeInTheDocument()
  })

  it('omits the horizontal-scroll hint when the activity table fits', () => {
    stubImageFetch()
    // jsdom reports scrollWidth === clientWidth (0), so no overflow is detected.
    render(<DayCard day={makeDay()} defaultOpen />)
    expect(screen.queryByText(/Scroll for links/)).not.toBeInTheDocument()
  })

  it('shows the "scroll for links" hint when the table overflows horizontally', async () => {
    stubImageFetch()
    // Force the overflow measurement: the scroll container is wider than its box.
    const scrollWidthSpy = vi
      .spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
      .mockReturnValue(900)
    const clientWidthSpy = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(640)
    try {
      render(<DayCard day={makeDay()} defaultOpen />)
      expect(await screen.findByText(/Scroll for links/)).toBeInTheDocument()
    } finally {
      scrollWidthSpy.mockRestore()
      clientWidthSpy.mockRestore()
    }
  })
})
