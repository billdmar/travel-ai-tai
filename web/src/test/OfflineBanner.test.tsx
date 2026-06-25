import { afterEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import OfflineBanner from '../pwa/OfflineBanner'

// navigator.onLine is read-only; redefine it per-test so we can simulate
// connectivity transitions, then restore the default (online) afterwards.
function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  })
}

describe('OfflineBanner', () => {
  afterEach(() => setOnLine(true))

  it('renders nothing while online', () => {
    setOnLine(true)
    const { container } = render(<OfflineBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the saved-data banner when an offline event fires', () => {
    setOnLine(true)
    render(<OfflineBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    act(() => {
      setOnLine(false)
      fireEvent(window, new Event('offline'))
    })

    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent(/offline/i)
    expect(banner).toHaveTextContent(/saved data/i)
  })

  it('seeds as offline when navigator reports no connection on mount', () => {
    setOnLine(false)
    render(<OfflineBanner />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('hides the banner again once an online event fires', () => {
    setOnLine(false)
    render(<OfflineBanner />)
    expect(screen.getByRole('status')).toBeInTheDocument()

    act(() => {
      setOnLine(true)
      fireEvent(window, new Event('online'))
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
