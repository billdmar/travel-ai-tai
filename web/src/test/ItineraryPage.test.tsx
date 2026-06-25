import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { getMock, streamMock, navigateMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  streamMock: vi.fn(),
  navigateMock: vi.fn(),
}))

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return { ...actual, getItinerary: getMock, streamItinerary: streamMock }
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

import ItineraryPage from '../pages/ItineraryPage'
import { ApiError } from '../api/client'
import { makeItinerary, makePreferences, stubImageFetch } from './fixtures'

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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/itinerary/it_test1']}>
      <Routes>
        <Route path="/itinerary/:id" element={<ItineraryPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** Render the page in streaming mode by seeding location.state.prefs. */
function renderStreamingPage() {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/itinerary/new', state: { prefs: makePreferences() } }]}
    >
      <Routes>
        <Route path="/itinerary/:id" element={<ItineraryPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ItineraryPage', () => {
  beforeEach(() => {
    getMock.mockReset()
    streamMock.mockReset()
    navigateMock.mockReset()
    setReducedMotion(false)
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

  it('streams generation output and navigates to the new itinerary on done', async () => {
    const itinerary = makeItinerary({ id: 'it_streamed' })
    let resolveStream: ((it: typeof itinerary) => void) | undefined
    streamMock.mockImplementation((_prefs, onChunk: (c: string) => void) => {
      // Trickle a prose chunk, then keep the stream open so the live text is
      // observable before we resolve and the parent swaps to the itinerary.
      onChunk('Sketching a route through Kyoto.')
      return new Promise<typeof itinerary>((resolve) => {
        resolveStream = resolve
      })
    })
    renderStreamingPage()
    expect(await screen.findByText(/Sketching a route through Kyoto\./)).toBeInTheDocument()
    resolveStream?.(itinerary)
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/itinerary/it_streamed', { replace: true }),
    )
  })

  it('advances the time-staged progress label over a setInterval cadence', async () => {
    vi.useFakeTimers()
    try {
      // Hold the stream open so the stepper is the only thing advancing.
      streamMock.mockReturnValue(new Promise(() => {}))
      renderStreamingPage()
      // First stage is rendered immediately (visible label + the sr-only twin).
      expect(screen.getAllByText('Gathering ideas').length).toBeGreaterThan(0)
      // Each tick of the interval advances the stage label in sequence.
      await act(() => vi.advanceTimersByTimeAsync(4500))
      expect(screen.getAllByText('Mapping your days').length).toBeGreaterThan(0)
      await act(() => vi.advanceTimersByTimeAsync(4500))
      expect(screen.getAllByText('Pricing & polishing').length).toBeGreaterThan(0)
      // Stays on the final stage; does not run off the end of the sequence.
      await act(() => vi.advanceTimersByTimeAsync(4500))
      expect(screen.getAllByText('Pricing & polishing').length).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders a static progress bar (no tween, no pulse) under reduced motion', async () => {
    setReducedMotion(true)
    streamMock.mockReturnValue(new Promise(() => {}))
    const { container } = renderStreamingPage()
    // The accent fill exists as a plain div with an inline width...
    const fill = container.querySelector('.bg-accent-400.rounded-full') as HTMLElement
    expect(fill).not.toBeNull()
    expect(fill.getAttribute('style') ?? '').toContain('width')
    // ...and carries no framer-driven inline transform/opacity tween.
    expect(fill.getAttribute('style') ?? '').not.toContain('transform')
    // No shimmering/pulsing element while idle on the progress track.
    const track = fill.parentElement as HTMLElement
    expect(track.querySelector('.animate-pulse')).toBeNull()
  })
})
