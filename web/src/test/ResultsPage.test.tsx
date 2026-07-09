import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import ResultsPage from '../pages/ResultsPage'
import { makeRecommendation, stubImageFetch } from './fixtures'

function renderPage(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/results', state }]}>
      <ResultsPage />
    </MemoryRouter>,
  )
}

describe('ResultsPage', () => {
  beforeEach(() => {
    stubImageFetch()
    sessionStorage.clear()
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows the empty guidance + Discover CTA when there is no router state', () => {
    renderPage(null)
    expect(
      screen.getByRole('heading', { name: /Let.s start with your interests/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Go to Discover/ })).toHaveAttribute(
      'href',
      '/discover',
    )
  })

  it('shows the empty state when recommendations is an empty array', () => {
    renderPage({ hobbies: ['Food'], recommendations: [] })
    expect(
      screen.getByRole('heading', { name: /Let.s start with your interests/ }),
    ).toBeInTheDocument()
  })

  it('renders one card per recommendation with its copy', () => {
    renderPage({
      hobbies: ['Food', 'History'],
      recommendations: [
        makeRecommendation({ name: 'Kyoto', country: 'Japan', why_it_fits: 'Temples.' }),
        makeRecommendation({ name: 'Lisbon', country: 'Portugal', why_it_fits: 'Trams.' }),
      ],
    })
    expect(screen.getByRole('heading', { name: 'Kyoto' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Lisbon' })).toBeInTheDocument()
    expect(screen.getByText('Temples.')).toBeInTheDocument()
    expect(screen.getByText(/Based on/)).toHaveTextContent(/food, history/)
  })

  it('renders each card as a router link to the plan route (preserving link semantics)', () => {
    const rec = makeRecommendation({ name: 'Kyoto', country: 'Japan' })
    renderPage({ hobbies: ['Food'], recommendations: [rec] })
    // The card is a real <Link> (role="link"), not a click-handler button — this
    // keeps keyboard activation + right-click "open in new tab" working.
    const card = screen.getByRole('link', { name: /Kyoto/ })
    expect(card).toHaveAttribute('href', '/plan/Kyoto')
  })

  it('persists valid results state to sessionStorage', () => {
    const state = {
      hobbies: ['Food'],
      recommendations: [makeRecommendation({ name: 'Kyoto', country: 'Japan' })],
    }
    renderPage(state)
    const stored = sessionStorage.getItem('tai.lastResults')
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!)).toEqual(state)
  })

  it('restores results from sessionStorage when location state is null', () => {
    const state = {
      hobbies: ['History'],
      recommendations: [
        makeRecommendation({ name: 'Rome', country: 'Italy', why_it_fits: 'Colosseum.' }),
      ],
    }
    sessionStorage.setItem('tai.lastResults', JSON.stringify(state))
    renderPage(null)
    expect(screen.getByRole('heading', { name: 'Rome' })).toBeInTheDocument()
    expect(screen.getByText('Colosseum.')).toBeInTheDocument()
  })
})
