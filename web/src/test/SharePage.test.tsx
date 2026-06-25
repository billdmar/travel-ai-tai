import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { getSharedMock } = vi.hoisted(() => ({ getSharedMock: vi.fn() }))

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return { ...actual, getSharedItinerary: getSharedMock }
})

import SharePage from '../pages/SharePage'
import { ApiError } from '../api/client'
import { makeItinerary, stubImageFetch } from './fixtures'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/share/tok_abc']}>
      <Routes>
        <Route path="/share/:token" element={<SharePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SharePage', () => {
  beforeEach(() => {
    getSharedMock.mockReset()
    stubImageFetch()
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows the loading skeleton initially', () => {
    getSharedMock.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByLabelText(/Generating itinerary/i)).toBeInTheDocument()
  })

  it('fetches the shared itinerary by token and renders it read-only', async () => {
    getSharedMock.mockResolvedValue(makeItinerary())
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Shared itinerary')).toBeInTheDocument(),
    )
    expect(getSharedMock).toHaveBeenCalledWith('tok_abc')
    // Read-only: no owner controls.
    expect(screen.queryByRole('button', { name: /Save itinerary/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Markdown' })).not.toBeInTheDocument()
  })

  it('shows an error banner and a "plan your own" link when the token is invalid', async () => {
    getSharedMock.mockRejectedValue(new ApiError(404, { detail: 'gone' }))
    renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Plan your own trip/ })).toHaveAttribute(
      'href',
      '/discover',
    )
  })
})
