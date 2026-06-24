import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Mock the api client so the page never touches real fetch. Both the named
// re-export of ApiError and recommendDestinations resolve from this module.
// vi.mock factories are hoisted above module scope, so the mock fns must be
// created via vi.hoisted() to exist when the factory runs.
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

function renderPage() {
  return render(
    <MemoryRouter>
      <DiscoverPage />
    </MemoryRouter>,
  )
}

describe('DiscoverPage', () => {
  beforeEach(() => {
    recommendMock.mockReset()
    navigateMock.mockReset()
  })
  afterEach(() => vi.restoreAllMocks())

  it('keeps the submit button disabled until a hobby is selected', () => {
    renderPage()
    expect(
      screen.getByRole('button', { name: /Find my destinations/ }),
    ).toBeDisabled()
  })

  it('toggles a hobby chip and enables submit', async () => {
    const user = userEvent.setup()
    renderPage()
    const chip = screen.getByRole('button', { name: 'Food' })
    await user.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('button', { name: /Find my destinations/ }),
    ).toBeEnabled()
  })

  it('calls the API and navigates to /results on success', async () => {
    const user = userEvent.setup()
    recommendMock.mockResolvedValue({
      recommendations: [
        {
          name: 'Kyoto',
          country: 'Japan',
          why_it_fits: '...',
          tags: ['food'],
          image_query: 'Kyoto',
          best_season: 'autumn',
        },
      ],
    })
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Food' }))
    await user.click(screen.getByRole('button', { name: /Find my destinations/ }))

    await waitFor(() => expect(recommendMock).toHaveBeenCalledOnce())
    expect(recommendMock).toHaveBeenCalledWith({
      hobbies: ['Food'],
      free_text: undefined,
    })
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/results', expect.anything()),
    )
  })

  it('surfaces a rate-limit message when the API throws 429', async () => {
    const user = userEvent.setup()
    recommendMock.mockRejectedValue(new ApiError(429, null, 30))
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Food' }))
    await user.click(screen.getByRole('button', { name: /Find my destinations/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /a lot of requests right now/i,
    )
    expect(navigateMock).not.toHaveBeenCalled()
  })
})
