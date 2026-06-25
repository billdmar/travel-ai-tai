import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Mock the api client so the page never touches real fetch. The curated-list
// loader is controlled per-test; vi.mock factories are hoisted, so the mock fn
// is created via vi.hoisted() to exist when the factory runs.
const { curatedMock } = vi.hoisted(() => ({ curatedMock: vi.fn() }))

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return { ...actual, fetchCuratedDestinations: curatedMock }
})

import ExplorePage from '../pages/ExplorePage'
import { DESTINATIONS } from '../components/explore/destinations'
import type { CuratedDestination } from '../components/explore/destinations'
import { stubImageFetch } from './fixtures'

function renderPage() {
  return render(
    <MemoryRouter>
      <ExplorePage />
    </MemoryRouter>,
  )
}

function gallery() {
  return screen.getByRole('list', { name: 'Destinations' })
}

describe('ExplorePage', () => {
  beforeEach(() => {
    stubImageFetch()
    // Default: the endpoint resolves with the same curated atlas the static
    // fallback holds, so existing ordering/filter assertions hold.
    curatedMock.mockReset()
    curatedMock.mockResolvedValue(DESTINATIONS)
  })
  afterEach(() => vi.restoreAllMocks())

  it('renders the editorial header and the full gallery by default', () => {
    renderPage()
    expect(
      screen.getByRole('heading', { name: /Somewhere worth the flight/ }),
    ).toBeInTheDocument()
    expect(within(gallery()).getAllByRole('listitem')).toHaveLength(DESTINATIONS.length)
  })

  it('exposes the vibe filter as an accessible group with All preselected', () => {
    renderPage()
    const group = screen.getByRole('group', { name: /Filter destinations by vibe/ })
    expect(within(group).getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('filters the gallery to a single vibe when its chip is selected', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Mountains' }))

    const mountainCount = DESTINATIONS.filter((d) => d.vibes.includes('Mountains')).length
    expect(within(gallery()).getAllByRole('listitem')).toHaveLength(mountainCount)
    expect(mountainCount).toBeLessThan(DESTINATIONS.length)
  })

  it('toggling the active vibe off restores the full gallery', async () => {
    const user = userEvent.setup()
    renderPage()
    const chip = screen.getByRole('button', { name: 'Food' })
    await user.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    await user.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(within(gallery()).getAllByRole('listitem')).toHaveLength(DESTINATIONS.length)
  })

  it('links the closing CTA to Discover', () => {
    renderPage()
    expect(
      screen.getByRole('link', { name: /Find my destination/ }),
    ).toHaveAttribute('href', '/discover')
  })

  it('renders the server-fetched curated list when the endpoint succeeds', async () => {
    const serverRows: CuratedDestination[] = [
      {
        slug: 'kyoto',
        name: 'Kyoto',
        country: 'Japan',
        query: 'Kyoto, Japan',
        tagline: 'Temple gardens.',
        bestSeason: 'spring',
        vibes: ['Culture'],
        story: ['A quiet city.'],
      },
      {
        slug: 'lisbon',
        name: 'Lisbon',
        country: 'Portugal',
        query: 'Lisbon, Portugal',
        tagline: 'Tiled hills.',
        bestSeason: 'autumn',
        vibes: ['City'],
        story: ['Trams and tiles.'],
      },
    ]
    curatedMock.mockResolvedValue(serverRows)
    renderPage()

    // Once the fetch resolves, the gallery shows exactly the server rows (a
    // count distinct from the static fallback proves the swap took effect).
    await waitFor(() =>
      expect(within(gallery()).getAllByRole('listitem')).toHaveLength(serverRows.length),
    )
    expect(serverRows.length).toBeLessThan(DESTINATIONS.length)
  })

  it('falls back to the bundled static atlas when the endpoint fails', async () => {
    curatedMock.mockRejectedValue(new Error('network down'))
    renderPage()

    // The fallback is the initial state, so the full static atlas is present
    // immediately and stays after the rejected fetch settles.
    expect(within(gallery()).getAllByRole('listitem')).toHaveLength(DESTINATIONS.length)
    await waitFor(() => expect(curatedMock).toHaveBeenCalled())
    expect(within(gallery()).getAllByRole('listitem')).toHaveLength(DESTINATIONS.length)
  })
})
