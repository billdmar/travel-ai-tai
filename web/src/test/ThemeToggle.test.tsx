import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ThemeToggle } from '../components/ui/ThemeToggle'

// Mock matchMedia for controlled testing.
function mockMatchMedia(prefersDark: boolean) {
  const listeners: Array<(e: MediaQueryListEvent) => void> = []
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
    media: query,
    onchange: null,
    addEventListener: (_event: string, handler: (e: MediaQueryListEvent) => void) => {
      listeners.push(handler)
    },
    removeEventListener: (_event: string, handler: (e: MediaQueryListEvent) => void) => {
      const idx = listeners.indexOf(handler)
      if (idx >= 0) listeners.splice(idx, 1)
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
  return listeners
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    // Clean slate: remove dark class & stored preference.
    document.documentElement.classList.remove('dark')
    localStorage.removeItem('tai.theme')
    mockMatchMedia(false)
  })

  it('cycles through system -> light -> dark -> system on click', () => {
    render(<ThemeToggle />)
    const btn = screen.getByRole('button')

    // Starts at 'system' (default when no stored preference).
    expect(btn).toHaveAttribute('aria-label', 'Theme: system (auto)')

    // Click: system -> light
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-label', 'Theme: light')

    // Click: light -> dark
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-label', 'Theme: dark')

    // Click: dark -> system
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-label', 'Theme: system (auto)')
  })

  it('persists the selected theme to localStorage', () => {
    render(<ThemeToggle />)
    const btn = screen.getByRole('button')

    // Click to light
    fireEvent.click(btn)
    expect(localStorage.getItem('tai.theme')).toBe('light')

    // Click to dark
    fireEvent.click(btn)
    expect(localStorage.getItem('tai.theme')).toBe('dark')

    // Click back to system
    fireEvent.click(btn)
    expect(localStorage.getItem('tai.theme')).toBe('system')
  })

  it('applies .dark class on documentElement when theme is dark', () => {
    render(<ThemeToggle />)
    const btn = screen.getByRole('button')

    // system mode with light OS preference -> no dark class.
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    // Click to light -> no dark class.
    fireEvent.click(btn)
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    // Click to dark -> dark class applied.
    fireEvent.click(btn)
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    // Click back to system (OS=light) -> dark class removed.
    fireEvent.click(btn)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('applies .dark class when OS prefers dark and mode is system', () => {
    // OS reports dark; the toggle's module-level preference persists across
    // tests, so drive it to a known 'system' state rather than assuming one.
    mockMatchMedia(true)
    render(<ThemeToggle />)
    const btn = screen.getByRole('button')

    // Cycle is system -> light -> dark -> system; at most three clicks land on
    // system from any starting point.
    for (let i = 0; i < 3 && btn.getAttribute('aria-label') !== 'Theme: system (auto)'; i++) {
      fireEvent.click(btn)
    }
    expect(btn).toHaveAttribute('aria-label', 'Theme: system (auto)')

    // In system mode the effective theme follows the OS. With matchMedia
    // reporting dark, the auto branch must apply the dark class.
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
