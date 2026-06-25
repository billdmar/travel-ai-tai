import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import LoadingSkeleton from '../components/LoadingSkeleton'

describe('LoadingSkeleton', () => {
  it('exposes a busy status region while the itinerary generates', () => {
    render(<LoadingSkeleton />)
    expect(screen.getByLabelText('Generating itinerary')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toHaveTextContent(/Crafting your personalized itinerary/)
  })

  it('renders shimmer surfaces on the app ink/canvas tokens (no stray slate/white)', () => {
    const { container } = render(<LoadingSkeleton />)
    const html = container.innerHTML
    // Palette alignment: the skeleton must use the design tokens, not the
    // pre-polish slate/white utilities.
    expect(html).toContain('border-ink-line')
    expect(html).toContain('bg-canvas-raised')
    expect(html).toContain('bg-canvas-sunken')
    expect(html).not.toMatch(/slate-/)
    expect(html).not.toMatch(/bg-white/)
  })

  it('keeps the reduced-motion guard on the animated shimmer blocks', () => {
    const { container } = render(<LoadingSkeleton />)
    expect(container.querySelectorAll('.motion-reduce\\:animate-none').length).toBeGreaterThan(0)
  })
})
