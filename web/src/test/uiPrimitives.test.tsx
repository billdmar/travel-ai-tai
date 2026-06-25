import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Reveal } from '../components/ui/Reveal'

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

describe('Button', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders a native <button> and forwards onClick + disabled', () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} disabled>
        Go
      </Button>,
    )
    const btn = screen.getByRole('button', { name: 'Go' })
    expect(btn).toBeDisabled()
    btn.click()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders a react-router Link when given `to`', () => {
    render(
      <MemoryRouter>
        <Button to="/discover">Start</Button>
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'Start' })
    expect(link).toHaveAttribute('href', '/discover')
  })

  it('renders an external anchor (new tab, noopener) when given `href`', () => {
    render(<Button href="https://example.com">Out</Button>)
    const anchor = screen.getByRole('link', { name: 'Out' })
    expect(anchor).toHaveAttribute('href', 'https://example.com')
    expect(anchor).toHaveAttribute('target', '_blank')
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('applies variant and size classes', () => {
    render(
      <Button variant="ghost" size="lg">
        Ghost
      </Button>,
    )
    const btn = screen.getByRole('button', { name: 'Ghost' })
    expect(btn.className).toContain('text-accent-600')
    expect(btn.className).toContain('text-base')
  })
})

describe('Reveal', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders a plain element (no motion props) under reduced motion', () => {
    setReducedMotion(true)
    render(
      <Reveal as="section" className="probe">
        <span>Calm content</span>
      </Reveal>,
    )
    const el = screen.getByText('Calm content').parentElement as HTMLElement
    expect(el.tagName.toLowerCase()).toBe('section')
    expect(el).toHaveClass('probe')
    // A plain element carries no framer style transform inline.
    expect(el.getAttribute('style') ?? '').not.toContain('opacity')
  })

  it('renders its children with motion enabled (default)', () => {
    setReducedMotion(false)
    render(
      <Reveal>
        <span>Animated content</span>
      </Reveal>,
    )
    expect(screen.getByText('Animated content')).toBeInTheDocument()
  })

  it('honors the polymorphic `as` tag', () => {
    setReducedMotion(true)
    render(
      <Reveal as="article">
        <span>Article body</span>
      </Reveal>,
    )
    expect(screen.getByText('Article body').parentElement?.tagName.toLowerCase()).toBe(
      'article',
    )
  })
})
