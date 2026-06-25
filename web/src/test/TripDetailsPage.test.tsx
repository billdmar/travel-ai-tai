import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { createMock, regenerateMock, navigateMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  regenerateMock: vi.fn(),
  navigateMock: vi.fn(),
}))

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return { ...actual, createItinerary: createMock, regenerateItinerary: regenerateMock }
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

import TripDetailsPage from '../pages/TripDetailsPage'
import { ApiError } from '../api/client'
import { makeItinerary, makePreferences, makeRecommendation } from './fixtures'

/** Render at /plan/:destination with optional router location state. */
function renderPage(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/plan/Kyoto', state }]}>
      <Routes>
        <Route path="/plan/:destination" element={<TripDetailsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('TripDetailsPage', () => {
  beforeEach(() => {
    createMock.mockReset()
    regenerateMock.mockReset()
    navigateMock.mockReset()
  })
  afterEach(() => vi.restoreAllMocks())

  it('derives the destination from the route param', () => {
    renderPage()
    expect(
      screen.getByRole('heading', { name: /Your trip to Kyoto/ }),
    ).toBeInTheDocument()
  })

  it('prefers the recommendation name + interests from router state', () => {
    renderPage({
      hobbies: ['Food', 'History'],
      recommendation: makeRecommendation({ name: 'Lisbon', country: 'Portugal' }),
    })
    expect(
      screen.getByRole('heading', { name: /Your trip to Lisbon/ }),
    ).toBeInTheDocument()
    expect(screen.getByText('Portugal')).toBeInTheDocument()
    expect(screen.getByText(/food, history/)).toBeInTheDocument()
  })

  it('submits a well-formed TravelPreferences payload and navigates on success', async () => {
    const user = userEvent.setup()
    createMock.mockResolvedValue(makeItinerary({ id: 'it_new' }))
    renderPage({ hobbies: ['Food'], recommendation: makeRecommendation() })
    await user.click(screen.getByRole('button', { name: /Build my itinerary/ }))

    await waitFor(() => expect(createMock).toHaveBeenCalledOnce())
    const payload = createMock.mock.calls[0][0]
    expect(payload).toMatchObject({
      destination: 'Kyoto',
      interests: ['Food'],
      pace: 'moderate',
      travel_style: 'midrange',
      group_size: 2,
      dietary_needs: [],
      accessibility_needs: [],
    })
    expect(typeof payload.start_date).toBe('string')
    expect(typeof payload.budget_usd).toBe('number')
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/itinerary/it_new'),
    )
  })

  it('reflects pace and style selections in the submitted payload', async () => {
    const user = userEvent.setup()
    createMock.mockResolvedValue(makeItinerary())
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Packed' }))
    await user.click(screen.getByRole('button', { name: 'Luxury' }))
    await user.click(screen.getByRole('button', { name: /Build my itinerary/ }))
    await waitFor(() => expect(createMock).toHaveBeenCalledOnce())
    expect(createMock.mock.calls[0][0]).toMatchObject({
      pace: 'packed',
      travel_style: 'luxury',
    })
  })

  it('shows a rate-limit message and does not navigate on a 429', async () => {
    const user = userEvent.setup()
    createMock.mockRejectedValue(new ApiError(429, null, 30))
    renderPage()
    await user.click(screen.getByRole('button', { name: /Build my itinerary/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Too many requests/i)
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('maps a 503 to a service-unavailable message', async () => {
    const user = userEvent.setup()
    createMock.mockRejectedValue(new ApiError(503, null))
    renderPage()
    await user.click(screen.getByRole('button', { name: /Build my itinerary/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/briefly unavailable/i)
  })

  it('in adjust mode pre-fills from the source prefs and regenerates', async () => {
    const user = userEvent.setup()
    regenerateMock.mockResolvedValue(makeItinerary({ id: 'it_regen' }))
    const preferences = makePreferences({
      destination: 'Lisbon',
      budget_usd: 4200,
      group_size: 5,
      travel_style: 'luxury',
    })
    renderPage({ adjust: { sourceId: 'src_1', preferences } })

    // Heading + button switch to the adjust affordance, seeded from the source.
    expect(
      screen.getByRole('heading', { name: /Adjust your trip to Lisbon/ }),
    ).toBeInTheDocument()
    expect(screen.getByText(/\$4,200 USD/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Luxury' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(screen.getByRole('button', { name: /Regenerate my trip/ }))

    await waitFor(() => expect(regenerateMock).toHaveBeenCalledOnce())
    expect(createMock).not.toHaveBeenCalled()
    const [sourceId, payload] = regenerateMock.mock.calls[0]
    expect(sourceId).toBe('src_1')
    // Seeded prefs (incl. dietary/accessibility carried through) flow back out.
    expect(payload).toMatchObject({
      destination: 'Lisbon',
      budget_usd: 4200,
      group_size: 5,
      travel_style: 'luxury',
    })
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/itinerary/it_regen'),
    )
  })
})
