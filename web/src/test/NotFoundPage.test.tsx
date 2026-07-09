import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotFoundPage from '../pages/NotFoundPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/this-page-does-not-exist']}>
      <NotFoundPage />
    </MemoryRouter>,
  )
}

describe('NotFoundPage', () => {
  it('renders the heading text', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'We looked everywhere.',
    )
  })

  it('renders a home link pointing to /', () => {
    renderPage()
    const homeLink = screen.getByRole('link', { name: /back to home/i })
    expect(homeLink).toHaveAttribute('href', '/')
  })

  it('renders an explore link pointing to /explore', () => {
    renderPage()
    const exploreLink = screen.getByRole('link', { name: /explore destinations/i })
    expect(exploreLink).toHaveAttribute('href', '/explore')
  })
})
