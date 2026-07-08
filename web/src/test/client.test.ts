import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  createItinerary,
  exportItinerary,
  fetchCuratedDestinations,
  fetchImage,
  resetCuratedDestinationsCache,
  getItinerary,
  recommendDestinations,
  streamItinerary,
} from '../api/client'
import type { TravelPreferences } from '../types/itinerary'

const PREFS: TravelPreferences = {
  destination: 'Kyoto',
  start_date: '2026-09-01',
  end_date: '2026-09-04',
  budget_usd: 2000,
  interests: ['food'],
  pace: 'moderate',
  travel_style: 'midrange',
  dietary_needs: [],
  accessibility_needs: [],
  group_size: 2,
}

/** Build a Response-like stub good enough for the client's parseBody/headers use. */
function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  const text = body === undefined ? '' : JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: async () => text,
    blob: async () => new Blob([text]),
  } as unknown as Response
}

describe('ApiError', () => {
  it('carries status, body, and retryAfterSeconds', () => {
    const err = new ApiError(503, { error: 'unavailable' }, 30)
    expect(err.status).toBe(503)
    expect(err.body).toEqual({ error: 'unavailable' })
    expect(err.retryAfterSeconds).toBe(30)
    expect(err.name).toBe('ApiError')
    expect(err).toBeInstanceOf(Error)
  })

  it('defaults retryAfterSeconds to null', () => {
    expect(new ApiError(500, null).retryAfterSeconds).toBeNull()
  })
})

describe('request error mapping', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves with parsed JSON on 2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { id: 'it_1', days: [] })),
    )
    const res = await getItinerary('it_1')
    expect((res as { id: string }).id).toBe('it_1')
  })

  it('throws ApiError(0) on a network-level failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(getItinerary('x')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
    })
    const err = await getItinerary('x').catch((e) => e)
    expect((err as ApiError).body).toMatchObject({ error: 'network_error' })
  })

  it('maps a 422 to ApiError carrying the validation body', async () => {
    const body = { detail: [{ loc: ['body', 'budget_usd'], msg: 'must be positive' }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(422, body)))
    const err = (await createItinerary(PREFS).catch((e) => e)) as ApiError
    expect(err.status).toBe(422)
    expect(err.body).toEqual(body)
  })

  it('extracts Retry-After from the response header on 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(429, { error: 'rate_limited' }, { 'Retry-After': '45' }),
      ),
    )
    const err = (await createItinerary(PREFS).catch((e) => e)) as ApiError
    expect(err.status).toBe(429)
    expect(err.retryAfterSeconds).toBe(45)
  })

  it('falls back to retry_after_seconds in the body when no header', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(429, { retry_after_seconds: 12 })),
    )
    const err = (await createItinerary(PREFS).catch((e) => e)) as ApiError
    expect(err.retryAfterSeconds).toBe(12)
  })

  it('sends JSON content-type and body for POST requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}))
    vi.stubGlobal('fetch', fetchMock)
    await recommendDestinations({ hobbies: ['food'], free_text: 'beaches' })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    )
    expect(JSON.parse(init.body)).toEqual({ hobbies: ['food'], free_text: 'beaches' })
  })
})

describe('fetchImage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns a synthetic fallback result on failure instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(503, null)))
    const img = await fetchImage('Kyoto temple')
    expect(img.fallback).toBe(true)
    expect(img.url).toBeNull()
    expect(img.alt).toBe('Kyoto temple')
  })
})

describe('fetchCuratedDestinations', () => {
  // The client memoizes the curated promise module-wide; drop it between cases
  // so each test exercises a fresh fetch.
  beforeEach(() => resetCuratedDestinationsCache())
  afterEach(() => vi.restoreAllMocks())

  it('unwraps the destinations array on success', async () => {
    const rows = [
      {
        slug: 'kyoto',
        name: 'Kyoto',
        country: 'Japan',
        query: 'Kyoto, Japan',
        tagline: 'Temples.',
        bestSeason: 'spring',
        vibes: ['Culture'],
        story: ['A line.'],
      },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { destinations: rows })))
    const out = await fetchCuratedDestinations()
    expect(out).toEqual(rows)
  })

  it('throws ApiError on a non-2xx response (caller handles the fallback)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(503, null)))
    await expect(fetchCuratedDestinations()).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
    })
  })
})

describe('exportItinerary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns a Blob on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { x: 1 })))
    const blob = await exportItinerary('it_1', 'markdown')
    expect(blob).toBeInstanceOf(Blob)
  })

  it('throws ApiError on a non-2xx export response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, { detail: 'missing' })))
    await expect(exportItinerary('nope', 'pdf')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
    })
  })

  it('throws ApiError(0) when the network drops mid-export', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(exportItinerary('it_1', 'markdown')).rejects.toMatchObject({
      status: 0,
    })
  })
})

/** Build a streaming Response whose body replays the given SSE text verbatim. */
function sseResponse(status: number, sse: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(sse))
      controller.close()
    },
  })
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    body: stream,
    text: async () => '',
  } as unknown as Response
}

describe('streamItinerary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('delivers progress chunks and resolves with the terminal itinerary', async () => {
    const sse =
      'data: Planning your trip to Kyoto...\n\n' +
      `data: ${JSON.stringify({ id: 'it_1', provider: 'mock', days: [] })}\n\n`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(200, sse)))

    const chunks: string[] = []
    const result = await streamItinerary(PREFS, (c) => chunks.push(c))

    expect((result as { id: string }).id).toBe('it_1')
    // Progress text is surfaced; the terminal JSON is the last chunk.
    expect(chunks[0]).toContain('Kyoto')
    expect(chunks).toHaveLength(2)
  })

  it('re-raises a named error event as ApiError(503) for llm_unavailable', async () => {
    // Regression: previously the client parsed this envelope as the final
    // ItineraryResponse, JSON.parse "succeeded" on the object, and the real
    // llm_unavailable code was masked (or a generic 502 parse_error thrown).
    const sse =
      'data: Planning your trip...\n\n' +
      'event: error\ndata: {"error": "llm_unavailable"}\n\n'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(200, sse)))

    const chunks: string[] = []
    const err = (await streamItinerary(PREFS, (c) => chunks.push(c)).catch(
      (e) => e,
    )) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(503)
    expect(err.body).toEqual({ error: 'llm_unavailable' })
    // The error envelope must NOT leak to onChunk as if it were progress text.
    expect(chunks).toEqual(['Planning your trip...'])
  })

  it('re-raises a named error event as ApiError(502) for itinerary_parse_failed', async () => {
    const sse = 'event: error\ndata: {"error": "itinerary_parse_failed"}\n\n'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(200, sse)))

    const err = (await streamItinerary(PREFS, () => {}).catch((e) => e)) as ApiError
    expect(err.status).toBe(502)
    expect(err.body).toEqual({ error: 'itinerary_parse_failed' })
  })

  it('falls back to ApiError(502) for an unrecognized error code', async () => {
    const sse = 'event: error\ndata: {"error": "mystery"}\n\n'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(200, sse)))

    const err = (await streamItinerary(PREFS, () => {}).catch((e) => e)) as ApiError
    expect(err.status).toBe(502)
    expect(err.body).toEqual({ error: 'mystery' })
  })

  it('throws ApiError(502, parse_error) when the stream ends without itinerary JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse(200, 'data: still working...\n\n')),
    )
    const err = (await streamItinerary(PREFS, () => {}).catch((e) => e)) as ApiError
    expect(err.status).toBe(502)
    expect(err.body).toMatchObject({ error: 'parse_error' })
  })
})
