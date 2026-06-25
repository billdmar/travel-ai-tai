import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../App'

/**
 * A11y guards for the app shell. The skip link and ``#main-content`` target are
 * static chrome rendered outside the lazy route boundary, so they're assertable
 * without resolving any page chunk.
 */
describe('App accessibility shell', () => {
  it('renders a "skip to main content" link that targets #main-content', () => {
    render(<App />)
    const skip = screen.getByRole('link', { name: /skip to main content/i })
    expect(skip).toHaveAttribute('href', '#main-content')
  })

  it('marks the page content region with id="main-content"', () => {
    render(<App />)
    expect(document.getElementById('main-content')?.tagName).toBe('MAIN')
  })
})
