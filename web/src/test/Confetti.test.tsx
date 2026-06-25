import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Confetti } from '../components/ui/Confetti'

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

describe('Confetti', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders the requested number of particles with motion enabled', () => {
    setReducedMotion(false)
    const { container } = render(<Confetti count={14} />)
    // The fixed, aria-hidden burst container...
    const burst = container.querySelector('[aria-hidden="true"]')
    expect(burst).toBeInTheDocument()
    // ...holds exactly `count` absolutely-positioned particle squares.
    expect(burst?.querySelectorAll('div').length).toBe(14)
  })

  it('honors a custom particle count', () => {
    setReducedMotion(false)
    const { container } = render(<Confetti count={6} />)
    expect(
      container.querySelector('[aria-hidden="true"]')?.querySelectorAll('div').length,
    ).toBe(6)
  })

  it('renders nothing (null) under reduced motion', () => {
    setReducedMotion(true)
    const { container } = render(<Confetti count={14} />)
    expect(container).toBeEmptyDOMElement()
  })
})
