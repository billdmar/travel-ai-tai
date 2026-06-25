import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Mock only the mutating client calls used directly by ItineraryView; image
// fetches are swallowed by the real fetchImage (fallback) once fetch is stubbed.
const { saveMock, exportMock, shareMock, removeMock, reorderMock } = vi.hoisted(() => ({
  saveMock: vi.fn(),
  exportMock: vi.fn(),
  shareMock: vi.fn(),
  removeMock: vi.fn(),
  reorderMock: vi.fn(),
}))

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return {
    ...actual,
    saveItinerary: saveMock,
    exportItinerary: exportMock,
    createShareLink: shareMock,
    removeDayActivity: removeMock,
    reorderDayActivities: reorderMock,
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
    removeMock.mockReset()
    reorderMock.mockReset()
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

  it('hides the Edit affordance in readOnly mode', () => {
    renderView({ readOnly: true })
    expect(screen.queryByRole('button', { name: /Edit activities/ })).not.toBeInTheDocument()
  })

  it('removes an activity: calls the API, updates the view optimistically', async () => {
    const user = userEvent.setup()
    // Server echoes the trip back with the activity gone (day 1 now has one).
    const after = makeItinerary()
    after.days[0].activities = [after.days[0].activities[0]]
    removeMock.mockResolvedValue(after)
    renderView()

    // Day 1 is open by default; enter edit mode and remove "Nishiki Market".
    await user.click(screen.getByRole('button', { name: /Edit activities/ }))
    expect(screen.getAllByText('Nishiki Market').length).toBeGreaterThan(0)
    await user.click(screen.getAllByRole('button', { name: /Remove Nishiki Market/ })[0])

    // The new client function is called for day 1, index 1.
    await waitFor(() => expect(removeMock).toHaveBeenCalledWith('it_test1', 1, 1))
    // The removed activity disappears from the rendered day.
    await waitFor(() =>
      expect(screen.queryByText('Nishiki Market')).not.toBeInTheDocument(),
    )
  })

  it('reverts the optimistic removal and shows an error banner on failure', async () => {
    const user = userEvent.setup()
    removeMock.mockRejectedValue(new ApiError(404, { error: 'itinerary_not_found' }))
    renderView()

    await user.click(screen.getByRole('button', { name: /Edit activities/ }))
    await user.click(screen.getAllByRole('button', { name: /Remove Nishiki Market/ })[0])

    // Error surfaces and the optimistically-removed activity comes back.
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getAllByText('Nishiki Market').length).toBeGreaterThan(0),
    )
  })

  it('reorders activities via the up/down controls', async () => {
    const user = userEvent.setup()
    reorderMock.mockResolvedValue(makeItinerary())
    renderView()
    await user.click(screen.getByRole('button', { name: /Edit activities/ }))
    // Move the first activity (index 0) down -> swap with index 1.
    await user.click(screen.getAllByRole('button', { name: /Move Fushimi Inari Shrine down/ })[0])
    await waitFor(() =>
      expect(reorderMock).toHaveBeenCalledWith('it_test1', 1, [1, 0]),
    )
  })
})
