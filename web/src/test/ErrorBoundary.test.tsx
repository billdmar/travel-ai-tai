import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ErrorBoundary from '../components/ErrorBoundary'

/** A child that throws on first render, then renders fine after `recover()`. */
function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('boom')
  return <p>Recovered content</p>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // The thrown error is expected; silence React's console noise for the run.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>Healthy child</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('Healthy child')).toBeInTheDocument()
  })

  it('renders the on-brand fallback when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('This page hit a snag')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
  })

  it('logs the caught error via componentDidCatch', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    )
    expect(console.error).toHaveBeenCalledWith(
      'ErrorBoundary caught an error',
      expect.any(Error),
      expect.anything(),
    )
  })

  it('"Try again" clears the error and re-renders the recovered subtree', () => {
    // A wrapper lets the test flip the child to a non-throwing state, so when
    // the boundary resets it mounts a healthy tree.
    function Harness() {
      const [throwing, setThrowing] = useState(true)
      return (
        <>
          <button onClick={() => setThrowing(false)}>fix</button>
          <ErrorBoundary>
            <Bomb shouldThrow={throwing} />
          </ErrorBoundary>
        </>
      )
    }
    render(<Harness />)
    expect(screen.getByText('This page hit a snag')).toBeInTheDocument()

    // Repair the underlying cause, then reset the boundary.
    fireEvent.click(screen.getByText('fix'))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(screen.getByText('Recovered content')).toBeInTheDocument()
    expect(screen.queryByText('This page hit a snag')).not.toBeInTheDocument()
  })
})
