import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DestinationImage } from '../components/DestinationImage'
import { makeFallbackImage, stubImageFetch } from './fixtures'

const { fetchImageMock } = vi.hoisted(() => ({ fetchImageMock: vi.fn() }))

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return { ...actual, fetchImage: fetchImageMock }
})

describe('DestinationImage', () => {
  beforeEach(() => {
    fetchImageMock.mockReset()
    // Default: the live service fails, so the bundled fallback is rendered.
    fetchImageMock.mockResolvedValue(makeFallbackImage('Kyoto'))
    stubImageFetch()
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows a pulsing skeleton before the image has loaded', async () => {
    render(<DestinationImage query="Kyoto" />)
    const img = await screen.findByRole('img')
    // Skeleton overlay is present and the image starts transparent (the live
    // fetch resolves to the bundled fallback, but onLoad has not fired yet).
    const skeleton = img.parentElement?.querySelector('[aria-hidden="true"]')
    expect(skeleton).not.toBeNull()
    expect(skeleton?.className).toContain('animate-pulse')
    expect(img.className).toContain('opacity-0')
  })

  it('reveals the image and removes the skeleton once it loads', async () => {
    render(<DestinationImage query="Kyoto" />)
    const img = screen.getByRole('img')
    fireEvent.load(img)
    await waitFor(() => expect(img.className).toContain('opacity-100'))
    expect(img.parentElement?.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('falls back to the bundled asset and credits no one when the live URL errors', async () => {
    fetchImageMock.mockResolvedValue({
      url: 'https://images.example.com/live.jpg',
      thumb_url: null,
      alt: 'Live Kyoto',
      credit: { name: 'A. Photographer', link: 'https://example.com/p' },
      fallback: false,
    })
    render(<DestinationImage query="Kyoto" />)
    const img = await screen.findByRole('img')
    await waitFor(() => expect(img).toHaveAttribute('src', 'https://images.example.com/live.jpg'))
    // Simulate the live <img> failing: component swaps to the bundled fallback,
    // which resets `loaded` so the fallback fades in fresh (skeleton returns).
    fireEvent.error(img)
    await waitFor(() =>
      expect(img.parentElement?.querySelector('[aria-hidden="true"]')).not.toBeNull(),
    )
    expect(img.getAttribute('src')).not.toBe('https://images.example.com/live.jpg')
    // Credit overlay only shows for a successfully-loaded live URL, not fallback.
    expect(screen.queryByText('A. Photographer')).not.toBeInTheDocument()
  })

  it('shows the photographer credit for a successful live image', async () => {
    fetchImageMock.mockResolvedValue({
      url: 'https://images.example.com/live.jpg',
      thumb_url: null,
      alt: 'Live Kyoto',
      credit: { name: 'A. Photographer', link: 'https://example.com/p' },
      fallback: false,
    })
    render(<DestinationImage query="Kyoto" />)
    const link = await screen.findByRole('link', { name: 'A. Photographer' })
    expect(link).toHaveAttribute('href', 'https://example.com/p')
  })

  it('uses the provided alt text over the resolved/query label', async () => {
    render(<DestinationImage query="Kyoto" alt="Custom alt" />)
    expect(await screen.findByAltText('Custom alt')).toBeInTheDocument()
  })
})
