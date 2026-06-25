import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Extends DiscoverPage.test.tsx with the free-text path, multi-select, toggle
// off, and the 503 service-unavailable branch.
const { recommendMock, navigateMock } = vi.hoisted(() => ({
  recommendMock: vi.fn(),
  navigateMock: vi.fn(),
}))

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return { ...actual, recommendDestinations: recommendMock }
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

import DiscoverPage from '../pages/DiscoverPage'
import { ApiError } from '../api/client'
import { makeRecommendation } from './fixtures'

function renderPage() {
  return render(
    <MemoryRouter>
      <DiscoverPage />
    </MemoryRouter>,
  )
}

describe('DiscoverPage (extended)', () => {
  beforeEach(() => {
    recommendMock.mockReset()
    navigateMock.mockReset()
  })
  afterEach(() => vi.restoreAllMocks())

  it('enables submit on free text alone (no hobby selected)', async () => {
    const user = userEvent.setup()
    renderPage()
    const submit = screen.getByRole('button', { name: /Find my destinations/ })
    expect(submit).toBeDisabled()
    await user.type(
      screen.getByLabelText(/Anything else/),
      'somewhere walkable with great coffee',
    )
    expect(submit).toBeEnabled()
  })

  it('sends both selected hobbies and trimmed free text in the request', async () => {
    const user = userEvent.setup()
    recommendMock.mockResolvedValue({ recommendations: [makeRecommendation()] })
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Food' }))
    await user.click(screen.getByRole('button', { name: 'History' }))
    await user.type(screen.getByLabelText(/Anything else/), '  spring trip  ')
    await user.click(screen.getByRole('button', { name: /Find my destinations/ }))
    await waitFor(() => expect(recommendMock).toHaveBeenCalledOnce())
    expect(recommendMock).toHaveBeenCalledWith({
      hobbies: ['Food', 'History'],
      free_text: 'spring trip',
    })
  })

  it('shows the running count and lets a hobby be toggled back off', async () => {
    const user = userEvent.setup()
    renderPage()
    const food = screen.getByRole('button', { name: 'Food' })
    await user.click(food)
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    await user.click(food)
    expect(food).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument()
  })

  it('maps a 503 to the service-unavailable message and does not navigate', async () => {
    const user = userEvent.setup()
    recommendMock.mockRejectedValue(new ApiError(503, null))
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Food' }))
    await user.click(screen.getByRole('button', { name: /Find my destinations/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/briefly unavailable/i)
    expect(navigateMock).not.toHaveBeenCalled()
  })
})
