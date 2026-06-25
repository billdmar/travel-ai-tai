import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useItinerary } from '../hooks/useItinerary'
import { makeItinerary } from './fixtures'

describe('useItinerary', () => {
  it('loads on mount and exposes the resolved itinerary', async () => {
    const itinerary = makeItinerary()
    const fetcher = vi.fn().mockResolvedValue(itinerary)
    const { result } = renderHook(() => useItinerary(fetcher))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.itinerary).toEqual(itinerary)
    expect(result.current.error).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('captures a fetch error and clears it on dismissError', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useItinerary(fetcher))

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error))
    expect(result.current.itinerary).toBeNull()
    act(() => result.current.dismissError())
    expect(result.current.error).toBeNull()
  })

  it('reload re-runs the fetcher', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValueOnce(makeItinerary())
    const { result } = renderHook(() => useItinerary(fetcher))

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error))
    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.error).toBeNull()
    expect(result.current.itinerary).not.toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not fetch when disabled, and setItinerary injects a value', async () => {
    const fetcher = vi.fn().mockResolvedValue(makeItinerary())
    const { result } = renderHook(() => useItinerary(fetcher, false))

    expect(result.current.loading).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()

    const injected = makeItinerary({ id: 'it_streamed' })
    act(() => result.current.setItinerary(injected))
    expect(result.current.itinerary).toEqual(injected)
    // reload is a no-op while disabled.
    await act(async () => {
      await result.current.reload()
    })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
