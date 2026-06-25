import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { getMock, navigateMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  navigateMock: vi.fn(),
}))

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return { ...actual, getItinerary: getMock }
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

import ItineraryPage from '../pages/ItineraryPage'
import { ApiError } from '../api/client'
import { makeItinerary, stubImageFetch } from './fixtures'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/itinerary/it_test1']}>
      <Routes>
        <Route path="/itinerary/:id" element={<ItineraryPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ItineraryPage', () => {
  beforeEach(() => {
    getMock.mockReset()
    navigateMock.mockReset()
    stubImageFetch()
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows the loading skeleton while the fetch is in flight', () => {
    getMock.mockReturnValue(new Promise(() => {})) // never resolves
    renderPage()
    expect(screen.getByLabelText(/Loading|generating/i)).toBeInTheDocument()
  })

  it('renders the itinerary once the fetch resolves', async () => {
    getMock.mockResolvedValue(makeItinerary())
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Kyoto', level: 2 })).toBeInTheDocument(),
    )
    expect(getMock).toHaveBeenCalledWith('it_test1')
  })

  it('shows an error banner with a retry control when the fetch fails', async () => {
    getMock.mockRejectedValue(new ApiError(404, { detail: 'not found' }))
    renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('retries the fetch when Retry is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    getMock
      .mockRejectedValueOnce(new ApiError(503, null))
      .mockResolvedValueOnce(makeItinerary())
    renderPage()
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Kyoto', level: 2 })).toBeInTheDocument(),
    )
    expect(getMock).toHaveBeenCalledTimes(2)
  })

  it('navigates to the plan form in adjust mode when "Adjust trip" is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const itinerary = makeItinerary()
    getMock.mockResolvedValue(itinerary)
    renderPage()
    await screen.findByRole('button', { name: 'Adjust trip' })
    await user.click(screen.getByRole('button', { name: 'Adjust trip' }))
    expect(navigateMock).toHaveBeenCalledWith('/plan/Kyoto', {
      state: {
        adjust: { sourceId: itinerary.id, preferences: itinerary.preferences },
      },
    })
  })
})
