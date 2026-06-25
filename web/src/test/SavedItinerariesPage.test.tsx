import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const { listMock, getMock, deleteMock, navigateMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  getMock: vi.fn(),
  deleteMock: vi.fn(),
  navigateMock: vi.fn(),
}))

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return {
    ...actual,
    listItineraries: listMock,
    getItinerary: getMock,
    deleteItinerary: deleteMock,
  }
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

import SavedItinerariesPage from '../pages/SavedItinerariesPage'
import { ApiError } from '../api/client'
import { makeItinerary, makeListItem, stubImageFetch } from './fixtures'

function emptyList() {
  return { page: 1, per_page: 20, total: 0, items: [] }
}
function listWith(items: ReturnType<typeof makeListItem>[], total = items.length) {
  return { page: 1, per_page: 20, total, items }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SavedItinerariesPage />
    </MemoryRouter>,
  )
}

describe('SavedItinerariesPage', () => {
  beforeEach(() => {
    listMock.mockReset()
    getMock.mockReset()
    deleteMock.mockReset()
    navigateMock.mockReset()
    localStorage.clear()
    stubImageFetch()
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows the loading skeleton before the list resolves', () => {
    listMock.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByLabelText('Loading saved itineraries')).toBeInTheDocument()
  })

  it('renders the empty state with a plan CTA when there are no saved trips', async () => {
    listMock.mockResolvedValue(emptyList())
    renderPage()
    expect(await screen.findByText('No saved itineraries yet')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Plan a trip' }))
    expect(navigateMock).toHaveBeenCalledWith('/discover')
  })

  it('keeps the staggered empty state intact under reduced motion (Reveal passes children through)', async () => {
    // Force reduced motion so the empty-state Reveals render their children as
    // plain elements — the heading, copy and CTA must all stay present.
    const original = window.matchMedia
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes('reduce'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia
    try {
      listMock.mockResolvedValue(emptyList())
      renderPage()
      expect(await screen.findByText('No saved itineraries yet')).toBeInTheDocument()
      expect(
        screen.getByText('Generate a trip and hit Save to keep it here for later.'),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Plan a trip' })).toBeInTheDocument()
    } finally {
      window.matchMedia = original
    }
  })

  it('lists saved itineraries with destination, dates and cost', async () => {
    listMock.mockResolvedValue(
      listWith([
        makeListItem({ id: 'a', destination: 'Kyoto' }),
        makeListItem({ id: 'b', destination: 'Lisbon' }),
      ]),
    )
    renderPage()
    expect(await screen.findByText('Kyoto')).toBeInTheDocument()
    expect(screen.getByText('Lisbon')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'View' })).toHaveLength(2)
  })

  it('opens a selected itinerary in the detail view', async () => {
    const user = userEvent.setup()
    listMock.mockResolvedValue(listWith([makeListItem({ id: 'a', destination: 'Kyoto' })]))
    getMock.mockResolvedValue(makeItinerary())
    renderPage()
    await screen.findByText('Kyoto')
    await user.click(screen.getByRole('button', { name: 'View' }))
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('a'))
    expect(
      await screen.findByRole('button', { name: /Back to saved itineraries/ }),
    ).toBeInTheDocument()
  })

  it('requires a confirm step before deleting, then reloads the list', async () => {
    const user = userEvent.setup()
    listMock.mockResolvedValue(listWith([makeListItem({ id: 'a', destination: 'Kyoto' })]))
    deleteMock.mockResolvedValue(undefined)
    renderPage()
    await screen.findByText('Kyoto')

    await user.click(screen.getByRole('button', { name: /Delete itinerary for Kyoto/ }))
    // Confirm affordance appears; delete has NOT fired yet.
    expect(deleteMock).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Confirm delete itinerary for Kyoto/ }))
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('a'))
    // Reloads the list after deletion (initial load + reload).
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2))
  })

  it('disables the Confirm button while a delete is in flight to prevent a double-fire', async () => {
    const user = userEvent.setup()
    listMock.mockResolvedValue(listWith([makeListItem({ id: 'a', destination: 'Kyoto' })]))
    // Hold the delete open so the in-flight state is observable.
    let resolveDelete: (() => void) | undefined
    deleteMock.mockReturnValue(new Promise<void>((res) => (resolveDelete = res)))
    renderPage()
    await screen.findByText('Kyoto')

    await user.click(screen.getByRole('button', { name: /Delete itinerary for Kyoto/ }))
    const confirm = screen.getByRole('button', { name: /Confirm delete itinerary for Kyoto/ })
    await user.click(confirm)

    // The first click fired exactly one delete and the button is now disabled.
    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(confirm).toBeDisabled()
    expect(confirm).toHaveTextContent('Deleting…')

    // A second click while in flight is a no-op (still one delete).
    await user.click(confirm)
    expect(deleteMock).toHaveBeenCalledTimes(1)

    resolveDelete?.()
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2))
  })

  it('surfaces an error banner when the list fetch fails', async () => {
    listMock.mockRejectedValue(new ApiError(0, { error: 'network_error' }))
    renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('selecting two trips enables Compare and navigates with their ids', async () => {
    const user = userEvent.setup()
    listMock.mockResolvedValue(
      listWith([
        makeListItem({ id: 'a', destination: 'Kyoto' }),
        makeListItem({ id: 'b', destination: 'Lisbon' }),
      ]),
    )
    renderPage()
    await screen.findByText('Kyoto')

    // Compare is disabled until at least two trips are selected.
    const compareBtn = screen.getByRole('button', { name: 'Compare' })
    expect(compareBtn).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: 'Select Kyoto to compare' }))
    expect(compareBtn).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Select Lisbon to compare' }))
    expect(compareBtn).toBeEnabled()

    await user.click(compareBtn)
    expect(navigateMock).toHaveBeenCalledWith('/compare?ids=a,b')
  })

  it('caps the compare selection at three trips', async () => {
    const user = userEvent.setup()
    listMock.mockResolvedValue(
      listWith([
        makeListItem({ id: 'a', destination: 'Kyoto' }),
        makeListItem({ id: 'b', destination: 'Lisbon' }),
        makeListItem({ id: 'c', destination: 'Porto' }),
        makeListItem({ id: 'd', destination: 'Oslo' }),
      ]),
    )
    renderPage()
    await screen.findByText('Kyoto')

    await user.click(screen.getByRole('checkbox', { name: 'Select Kyoto to compare' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Lisbon to compare' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Porto to compare' }))
    // Fourth checkbox is disabled once the cap is reached.
    expect(screen.getByRole('checkbox', { name: 'Select Oslo to compare' })).toBeDisabled()
  })

  it('persists the compare selection to localStorage and restores it on reload', async () => {
    const user = userEvent.setup()
    listMock.mockResolvedValue(listWith([makeListItem({ id: 'a', destination: 'Kyoto' })]))
    const { unmount } = renderPage()
    await screen.findByText('Kyoto')

    await user.click(screen.getByRole('checkbox', { name: 'Select Kyoto to compare' }))
    expect(JSON.parse(localStorage.getItem('tai.compareSelection') ?? '[]')).toEqual(['a'])

    // Re-mounting (a reload) restores the checkbox from localStorage.
    unmount()
    renderPage()
    await screen.findByText('Kyoto')
    expect(screen.getByRole('checkbox', { name: 'Select Kyoto to compare' })).toBeChecked()
  })
})
