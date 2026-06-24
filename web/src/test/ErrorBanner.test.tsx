import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ErrorBanner from '../components/ErrorBanner'
import { ApiError } from '../api/client'

describe('ErrorBanner', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders the network-error copy for ApiError status 0', () => {
    render(<ErrorBanner error={new ApiError(0, { error: 'network_error' })} />)
    expect(screen.getByText('Network error')).toBeInTheDocument()
    expect(screen.getByText(/Could not reach the server/i)).toBeInTheDocument()
  })

  it('lists field-level validation messages for a 422', () => {
    const body = { detail: [{ loc: ['body', 'budget_usd'], msg: 'must be positive' }] }
    render(<ErrorBanner error={new ApiError(422, body)} />)
    expect(screen.getByText('Please fix your preferences')).toBeInTheDocument()
    expect(screen.getByText(/budget_usd: must be positive/)).toBeInTheDocument()
  })

  it('shows a Retry-After countdown and disables retry for a 429', () => {
    const onRetry = vi.fn()
    render(<ErrorBanner error={new ApiError(429, null, 30)} onRetry={onRetry} />)
    expect(screen.getByText('Too many requests')).toBeInTheDocument()
    expect(screen.getByText(/You can retry in 30s\./)).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Retry' })
    expect(retry).toBeDisabled()
    fireEvent.click(retry)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('falls back to a generic message for non-ApiError values', () => {
    render(<ErrorBanner error={new Error('kaboom')} />)
    expect(screen.getByText('Unexpected error')).toBeInTheDocument()
    expect(screen.getByText('kaboom')).toBeInTheDocument()
  })

  it('invokes onDismiss when the dismiss control is clicked', () => {
    const onDismiss = vi.fn()
    render(<ErrorBanner error={new ApiError(503, null)} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
