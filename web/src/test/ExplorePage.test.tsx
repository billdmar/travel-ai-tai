import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ExplorePage from '../pages/ExplorePage'
import { DESTINATIONS } from '../components/explore/destinations'
import { stubImageFetch } from './fixtures'

function renderPage() {
  return render(
    <MemoryRouter>
      <ExplorePage />
    </MemoryRouter>,
  )
}

describe('ExplorePage', () => {
  beforeEach(() => stubImageFetch())
  afterEach(() => vi.restoreAllMocks())

  it('renders the editorial header and the full gallery by default', () => {
    renderPage()
    expect(
      screen.getByRole('heading', { name: /Somewhere worth the flight/ }),
    ).toBeInTheDocument()
    const gallery = screen.getByRole('list', { name: 'Destinations' })
    expect(within(gallery).getAllByRole('listitem')).toHaveLength(DESTINATIONS.length)
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
    const gallery = screen.getByRole('list', { name: 'Destinations' })
    expect(within(gallery).getAllByRole('listitem')).toHaveLength(mountainCount)
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
    const gallery = screen.getByRole('list', { name: 'Destinations' })
    expect(within(gallery).getAllByRole('listitem')).toHaveLength(DESTINATIONS.length)
  })

  it('links the closing CTA to Discover', () => {
    renderPage()
    expect(
      screen.getByRole('link', { name: /Find my destination/ }),
    ).toHaveAttribute('href', '/discover')
  })
})
