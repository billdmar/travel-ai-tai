import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DayCard from '../components/DayCard'
import { makeActivity, makeDay, stubImageFetch } from './fixtures'

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
})
