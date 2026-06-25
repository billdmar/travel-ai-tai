import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
