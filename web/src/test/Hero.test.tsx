import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const { curatedMock, navigateMock } = vi.hoisted(() => ({
  curatedMock: vi.fn(),
  navigateMock: vi.fn(),
}))

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return { ...actual, fetchCuratedDestinations: curatedMock }
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

import Hero from '../components/Hero'
import { HERO_SLIDES } from '../assets/hero'

/** Force prefers-reduced-motion so the hero renders its deterministic still. */
function forceReducedMotion() {
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
}

function renderHero() {
  return render(
    <MemoryRouter>
      <Hero />
    </MemoryRouter>,
  )
}

describe('Hero (reduced motion)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders the headline and both calls to action', () => {
    forceReducedMotion()
    renderHero()
    expect(
      screen.getByRole('heading', { name: /Trips that begin with what you love\./ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Start discovering/ })).toHaveAttribute(
      'href',
      '/discover',
    )
    expect(screen.getByRole('link', { name: 'How it works' })).toHaveAttribute(
      'href',
      '/how-it-works',
    )
  })

  it('shows only the first slide as a single still (no slideshow) under reduced motion', () => {
    forceReducedMotion()
    renderHero()
    // The first slide's alt is the only labeled background image rendered; the
    // masked over-text overlay is suppressed entirely under reduced motion.
    const firstAlt = HERO_SLIDES[0].alt
    expect(screen.getByRole('img', { name: firstAlt })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: firstAlt }).tagName.toLowerCase()).toBe('img')
  })

  it('does not start an advancing interval under reduced motion', () => {
    forceReducedMotion()
    const setInterval = vi.spyOn(window, 'setInterval')
    renderHero()
    expect(setInterval).not.toHaveBeenCalled()
  })
})

describe('Hero "Surprise me" CTA', () => {
  beforeEach(() => {
    curatedMock.mockReset()
    navigateMock.mockReset()
    forceReducedMotion()
  })
  afterEach(() => vi.restoreAllMocks())

  it('picks a curated destination and navigates into planning it', async () => {
    const user = userEvent.setup()
    curatedMock.mockResolvedValue([
      { slug: 'kyoto', name: 'Kyoto', country: 'Japan', query: '', tagline: '', bestSeason: '', vibes: [], story: [] },
    ])
    renderHero()
    await user.click(screen.getByRole('button', { name: /Surprise me/ }))
    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(1))
    // Whatever was picked, we routed to a /plan/ path for it.
    expect(navigateMock.mock.calls[0][0]).toMatch(/^\/plan\//)
    expect(navigateMock).toHaveBeenCalledWith('/plan/Kyoto')
  })

  it('falls back to the static atlas and still navigates when the fetch rejects', async () => {
    const user = userEvent.setup()
    curatedMock.mockRejectedValue(new Error('offline'))
    renderHero()
    await user.click(screen.getByRole('button', { name: /Surprise me/ }))
    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(1))
    // The static DESTINATIONS fallback still yields a /plan/<name> route.
    expect(navigateMock.mock.calls[0][0]).toMatch(/^\/plan\/.+/)
  })

  it('falls back to the static atlas when the curated payload is empty', async () => {
    const user = userEvent.setup()
    curatedMock.mockResolvedValue([])
    renderHero()
    await user.click(screen.getByRole('button', { name: /Surprise me/ }))
    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(1))
    expect(navigateMock.mock.calls[0][0]).toMatch(/^\/plan\/.+/)
  })

  it('disables the button while the lookup is in flight, then re-enables it', async () => {
    const user = userEvent.setup()
    let resolve: ((v: unknown[]) => void) | undefined
    curatedMock.mockReturnValue(new Promise((res) => (resolve = res)))
    renderHero()
    const btn = screen.getByRole('button', { name: /Surprise me|Finding/ })
    await user.click(btn)
    // In flight: disabled, busy, label swapped for the spinner copy.
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
    expect(btn).toHaveTextContent('Finding…')
    resolve?.([
      { slug: 'kyoto', name: 'Kyoto', country: 'Japan', query: '', tagline: '', bestSeason: '', vibes: [], story: [] },
    ])
    await waitFor(() => expect(navigateMock).toHaveBeenCalled())
  })
})
