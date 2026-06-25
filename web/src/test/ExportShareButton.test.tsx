import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock the api client so no real fetch is issued; ApiError stays the real class
// so ErrorBanner classification works on the rejection path.
const { exportMock, shareMock } = vi.hoisted(() => ({
  exportMock: vi.fn(),
  shareMock: vi.fn(),
}))

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return { ...actual, exportItinerary: exportMock, createShareLink: shareMock }
})

import ExportShareButton from '../components/ExportShareButton'
import { ApiError } from '../api/client'

describe('ExportShareButton', () => {
  beforeEach(() => {
    exportMock.mockReset()
    shareMock.mockReset()
    // jsdom lacks object-URL + clipboard; provide inert stubs.
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('renders the export and share controls', () => {
    render(<ExportShareButton itineraryId="it_1" />)
    expect(screen.getByRole('button', { name: 'Markdown' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Add to calendar/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Share link/ })).toBeInTheDocument()
  })

  it('requests a markdown export and triggers a download on success', async () => {
    const user = userEvent.setup()
    exportMock.mockResolvedValue(new Blob(['# trip']))
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<ExportShareButton itineraryId="it_42" />)
    await user.click(screen.getByRole('button', { name: 'Markdown' }))
    await waitFor(() => expect(exportMock).toHaveBeenCalledWith('it_42', 'markdown'))
    expect(clickSpy).toHaveBeenCalled()
  })

  it('requests a pdf export with the pdf format', async () => {
    const user = userEvent.setup()
    exportMock.mockResolvedValue(new Blob(['%PDF']))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<ExportShareButton itineraryId="it_7" />)
    await user.click(screen.getByRole('button', { name: 'PDF' }))
    await waitFor(() => expect(exportMock).toHaveBeenCalledWith('it_7', 'pdf'))
  })

  it('requests an ics export and triggers a .ics download', async () => {
    const user = userEvent.setup()
    exportMock.mockResolvedValue(new Blob(['BEGIN:VCALENDAR']))
    const downloads: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download)
    })
    render(<ExportShareButton itineraryId="it_5" />)
    await user.click(screen.getByRole('button', { name: /Add to calendar/ }))
    await waitFor(() => expect(exportMock).toHaveBeenCalledWith('it_5', 'ics'))
    expect(downloads).toEqual(['itinerary-it_5.ics'])
  })

  it('creates a share link and copies the /share URL to the clipboard', async () => {
    const user = userEvent.setup()
    shareMock.mockResolvedValue({ token: 'tok_abc' })
    render(<ExportShareButton itineraryId="it_9" />)
    await user.click(screen.getByRole('button', { name: /Share link/ }))
    await waitFor(() => expect(shareMock).toHaveBeenCalledWith('it_9'))
    // The copied-to-clipboard toast is the observable success behavior.
    expect(await screen.findByRole('status')).toHaveTextContent(/copied to clipboard/i)
  })

  it('surfaces an error banner when the export fails', async () => {
    const user = userEvent.setup()
    exportMock.mockRejectedValue(new ApiError(404, { detail: 'missing' }))
    render(<ExportShareButton itineraryId="nope" />)
    await user.click(screen.getByRole('button', { name: 'Markdown' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('falls back to showing the URL when the clipboard write is blocked', async () => {
    const user = userEvent.setup()
    shareMock.mockResolvedValue({ token: 'tok_xyz' })
    navigator.clipboard.writeText = vi.fn().mockRejectedValue(new Error('blocked'))
    render(<ExportShareButton itineraryId="it_3" />)
    await user.click(screen.getByRole('button', { name: /Share link/ }))
    expect(await screen.findByRole('status')).toHaveTextContent(/share\/tok_xyz/i)
  })
})
