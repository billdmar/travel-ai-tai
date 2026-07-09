import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import InstallBanner from '../pwa/InstallBanner'

// Minimal mock of BeforeInstallPromptEvent
function createInstallPromptEvent() {
  const event = new Event('beforeinstallprompt', { cancelable: true })
  ;(event as unknown as { prompt: () => Promise<void> }).prompt = vi.fn(() => Promise.resolve())
  ;(event as unknown as { userChoice: Promise<unknown> }).userChoice = Promise.resolve({
    outcome: 'accepted',
    platform: 'web',
  })
  return event
}

describe('InstallBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    // Ensure matchMedia returns non-standalone
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the banner after the beforeinstallprompt event fires and 30s elapse', () => {
    render(<InstallBanner />)
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()

    // Fire the beforeinstallprompt
    act(() => {
      fireEvent(window, createInstallPromptEvent())
    })

    // Still hidden — 30s delay not elapsed
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()

    // Advance past the 30s delay
    act(() => {
      vi.advanceTimersByTime(30_000)
    })

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('banner')).toHaveTextContent(/Install Travel/i)
  })

  it('dismisses the banner and sets localStorage when X is clicked', () => {
    render(<InstallBanner />)

    act(() => {
      fireEvent(window, createInstallPromptEvent())
    })
    act(() => {
      vi.advanceTimersByTime(30_000)
    })

    expect(screen.getByRole('banner')).toBeInTheDocument()

    // Click dismiss
    act(() => {
      fireEvent.click(screen.getByLabelText('Dismiss install prompt'))
    })

    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(localStorage.getItem('tai.installDismissed')).toBe('1')
  })

  it('calls prompt() when the Install button is clicked', async () => {
    render(<InstallBanner />)

    const event = createInstallPromptEvent()
    act(() => {
      fireEvent(window, event)
    })
    act(() => {
      vi.advanceTimersByTime(30_000)
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Install'))
    })

    expect((event as unknown as { prompt: ReturnType<typeof vi.fn> }).prompt).toHaveBeenCalled()
  })

  it('does not show banner if user previously dismissed', () => {
    localStorage.setItem('tai.installDismissed', '1')
    render(<InstallBanner />)

    act(() => {
      fireEvent(window, createInstallPromptEvent())
    })
    act(() => {
      vi.advanceTimersByTime(30_000)
    })

    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
  })
})
