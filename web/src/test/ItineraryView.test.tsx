import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Mock only the mutating client calls used directly by ItineraryView; image
// fetches are swallowed by the real fetchImage (fallback) once fetch is stubbed.
const { saveMock, exportMock, shareMock } = vi.hoisted(() => ({
  saveMock: vi.fn(),
  exportMock: vi.fn(),
  shareMock: vi.fn(),
}))

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return {
    ...actual,
    saveItinerary: saveMock,
    exportItinerary: exportMock,
    createShareLink: shareMock,
  }
})

import ItineraryView from '../components/ItineraryView'
import { ApiError } from '../api/client'
import { makeItinerary, stubImageFetch } from './fixtures'

function renderView(props: Partial<Parameters<typeof ItineraryView>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ItineraryView itinerary={makeItinerary()} {...props} />
    </MemoryRouter>,
  )
}

describe('ItineraryView', () => {
  beforeEach(() => {
    saveMock.mockReset()
    stubImageFetch()
  })
  afterEach(() => vi.restoreAllMocks())

  it('renders the destination, est. total and summary', () => {
    renderView()
    expect(screen.getByRole('heading', { name: 'Kyoto', level: 2 })).toBeInTheDocument()
    expect(screen.getByText(/A measured three days through old Kyoto\./)).toBeInTheDocument()
    expect(screen.getAllByText(/\$55/).length).toBeGreaterThan(0)
  })

  it('renders one DayCard per day and the travel tips', () => {
    renderView()
    expect(screen.getByRole('button', { name: /Temples & tea/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Gardens & gion/ })).toBeInTheDocument()
    expect(screen.getByText('Buy an IC card for transit.')).toBeInTheDocument()
  })

  it('saves the itinerary and shows the confirmation toast', async () => {
    const user = userEvent.setup()
    saveMock.mockResolvedValue(makeItinerary({ saved: true }))
    renderView()
    await user.click(screen.getByRole('button', { name: /Save itinerary/ }))
    await waitFor(() => expect(saveMock).toHaveBeenCalledWith('it_test1'))
    expect(await screen.findByLabelText('Itinerary saved')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Saved to your itineraries.')
  })

  it('surfaces an error banner and stays in idle when save fails', async () => {
    const user = userEvent.setup()
    saveMock.mockRejectedValue(new ApiError(503, null))
    renderView()
    await user.click(screen.getByRole('button', { name: /Save itinerary/ }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    // Still offers Save (returned to idle), not a permanent "Saved" state.
    expect(screen.getByRole('button', { name: /Save itinerary/ })).toBeInTheDocument()
  })

  it('renders the saved badge immediately when the itinerary is already saved', () => {
    render(
      <MemoryRouter>
        <ItineraryView itinerary={makeItinerary({ saved: true })} />
      </MemoryRouter>,
    )
    expect(screen.getByLabelText('Itinerary saved')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Save itinerary/ })).not.toBeInTheDocument()
  })

  it('hides all owner controls (save, export, share) in readOnly mode', () => {
    render(
      <MemoryRouter>
        <ItineraryView itinerary={makeItinerary()} readOnly />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: /Save itinerary/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Markdown' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Share link/ })).not.toBeInTheDocument()
  })

  it('invokes onReset when "Plan another trip" is clicked', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()
    renderView({ onReset })
    await user.click(screen.getByRole('button', { name: 'Plan another trip' }))
    expect(onReset).toHaveBeenCalledOnce()
  })

  it('invokes onAdjust when "Adjust trip" is clicked', async () => {
    const user = userEvent.setup()
    const onAdjust = vi.fn()
    renderView({ onAdjust })
    await user.click(screen.getByRole('button', { name: 'Adjust trip' }))
    expect(onAdjust).toHaveBeenCalledOnce()
  })

  it('hides the "Adjust trip" button in readOnly mode', () => {
    renderView({ onAdjust: vi.fn(), readOnly: true })
    expect(screen.queryByRole('button', { name: 'Adjust trip' })).not.toBeInTheDocument()
  })
})
