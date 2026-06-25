import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return { ...actual, getItinerary: getMock }
})

import ComparePage from '../pages/ComparePage'
import { ApiError } from '../api/client'
import { makeItinerary, makePreferences } from './fixtures'

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ComparePage />
    </MemoryRouter>,
  )
}

describe('ComparePage', () => {
  beforeEach(() => getMock.mockReset())
  afterEach(() => vi.restoreAllMocks())

  it('shows an empty state when no ids are supplied', async () => {
    renderAt('/compare')
    expect(await screen.findByText('No trips selected')).toBeInTheDocument()
    expect(getMock).not.toHaveBeenCalled()
  })

  it('fetches each id and renders a summary column per trip', async () => {
    getMock.mockImplementation(async (id: string) =>
      makeItinerary({
        id,
        preferences: makePreferences({ destination: id === 'a' ? 'Kyoto' : 'Lisbon' }),
      }),
    )
    renderAt('/compare?ids=a,b')

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2))
    expect(getMock).toHaveBeenCalledWith('a')
    expect(getMock).toHaveBeenCalledWith('b')
    // Both destinations appear (summary + day-by-day headers reference them).
    expect(await screen.findByText('Kyoto')).toBeInTheDocument()
    expect(screen.getByText('Lisbon')).toBeInTheDocument()
    // Two budget breakdowns render, one per trip.
    expect(screen.getAllByText('Budget breakdown')).toHaveLength(2)
  })

  it('de-duplicates and clamps the id list to at most three', async () => {
    getMock.mockImplementation(async (id: string) => makeItinerary({ id }))
    renderAt('/compare?ids=a,a,b,c,d')
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(3))
    expect(getMock.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c'])
  })

  it('degrades gracefully when an id is missing/deleted', async () => {
    getMock.mockImplementation(async (id: string) => {
      if (id === 'gone') throw new ApiError(404, { error: 'not_found' })
      return makeItinerary({ id, preferences: makePreferences({ destination: 'Kyoto' }) })
    })
    renderAt('/compare?ids=a,gone')

    expect(await screen.findByText('Trip unavailable')).toBeInTheDocument()
    // The surviving trip still renders its summary + breakdown.
    expect(screen.getByText('Kyoto')).toBeInTheDocument()
    expect(screen.getByText('gone')).toBeInTheDocument()
  })
})
