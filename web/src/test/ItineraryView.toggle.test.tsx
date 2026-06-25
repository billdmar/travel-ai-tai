import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Stub the lazy MapView so this spec exercises only the List|Map toggle wiring
// in ItineraryView — MapView's own behavior is covered in MapView.test.tsx, and
// the real module pulls in Leaflet (DOM measurements jsdom can't satisfy).
vi.mock('../components/MapView', () => ({
  default: ({ days }: { days: unknown[] }) => (
    <div data-testid="map-view">map with {days.length} days</div>
  ),
}))

import ItineraryView from '../components/ItineraryView'
import { makeItinerary, stubImageFetch } from './fixtures'

function renderView() {
  return render(
    <MemoryRouter>
      <ItineraryView itinerary={makeItinerary()} />
    </MemoryRouter>,
  )
}

describe('ItineraryView list/map toggle', () => {
  beforeEach(() => stubImageFetch())
  afterEach(() => vi.restoreAllMocks())

  it('defaults to the List view (day cards shown, map hidden)', () => {
    renderView()
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Temples & tea/ })).toBeInTheDocument()
    expect(screen.queryByTestId('map-view')).not.toBeInTheDocument()
  })

  it('switches to the Map view when Map is clicked, then back to List', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('button', { name: 'Map' }))
    expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-pressed', 'true')
    // Lazy MapView resolves and the day cards are unmounted.
    expect(await screen.findByTestId('map-view')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Temples & tea/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.getByRole('button', { name: /Temples & tea/ })).toBeInTheDocument()
    expect(screen.queryByTestId('map-view')).not.toBeInTheDocument()
  })
})
