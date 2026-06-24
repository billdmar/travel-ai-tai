import type {
  ImageResult,
  RecommendRequest,
  RecommendResponse,
} from '../types/discovery'
import type {
  ItineraryListResponse,
  ItineraryResponse,
  TravelPreferences,
  ValidateResponse,
} from '../types/itinerary'

/**
 * Error thrown for any non-2xx API response. Carries the HTTP status and the
 * parsed response body (if any) so callers can branch on status (422/429/503/etc).
 */
export class ApiError extends Error {
  status: number
  body: unknown
  retryAfterSeconds: number | null

  constructor(status: number, body: unknown, retryAfterSeconds: number | null = null) {
    super(`API request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
    this.retryAfterSeconds = retryAfterSeconds
  }
}

const BASE = '/api/v1'

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function extractRetryAfter(res: Response, body: unknown): number | null {
  const header = res.headers.get('Retry-After')
  if (header) {
    const n = Number(header)
    if (!Number.isNaN(n)) return n
  }
  if (body && typeof body === 'object' && 'retry_after_seconds' in body) {
    const n = Number((body as Record<string, unknown>).retry_after_seconds)
    if (!Number.isNaN(n)) return n
  }
  return null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
  } catch (err) {
    // Network-level failure (server down, DNS, CORS, offline, etc).
    throw new ApiError(0, { error: 'network_error', detail: String(err) })
  }

  const body = await parseBody(res)

  if (!res.ok) {
    throw new ApiError(res.status, body, extractRetryAfter(res, body))
  }

  return body as T
}

export function createItinerary(prefs: TravelPreferences): Promise<ItineraryResponse> {
  return request<ItineraryResponse>(`${BASE}/itineraries`, {
    method: 'POST',
    body: JSON.stringify(prefs),
  })
}

export function getItinerary(id: string): Promise<ItineraryResponse> {
  return request<ItineraryResponse>(`${BASE}/itineraries/${encodeURIComponent(id)}`)
}

export function listItineraries(page = 1, perPage = 20): Promise<ItineraryListResponse> {
  const qs = new URLSearchParams({ page: String(page), per_page: String(perPage) })
  return request<ItineraryListResponse>(`${BASE}/itineraries?${qs.toString()}`)
}

export function saveItinerary(id: string): Promise<ItineraryResponse> {
  return request<ItineraryResponse>(`${BASE}/itineraries/${encodeURIComponent(id)}/save`, {
    method: 'POST',
  })
}

export function deleteItinerary(id: string): Promise<void> {
  return request<void>(`${BASE}/itineraries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function validatePreferences(prefs: TravelPreferences): Promise<ValidateResponse> {
  return request<ValidateResponse>(`${BASE}/preferences/validate`, {
    method: 'POST',
    body: JSON.stringify(prefs),
  })
}

/**
 * Ask the backend to recommend 4-6 destinations from the user's hobbies and an
 * optional free-text note. FROZEN contract: POST /api/v1/destinations/recommend.
 */
export function recommendDestinations(req: RecommendRequest): Promise<RecommendResponse> {
  return request<RecommendResponse>(`${BASE}/destinations/recommend`, {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

/**
 * Resolve a photo for a destination/place query. FROZEN contract:
 * GET /api/v1/images?query=... On any failure (network, 4xx/5xx) we return a
 * synthetic `fallback: true` result so <DestinationImage> can render a bundled
 * asset instead of throwing — image fetches must never break a page.
 */
export async function fetchImage(query: string): Promise<ImageResult> {
  const qs = new URLSearchParams({ query })
  try {
    return await request<ImageResult>(`${BASE}/images?${qs.toString()}`)
  } catch {
    return { url: null, thumb_url: null, alt: query, credit: null, fallback: true }
  }
}

/**
 * Download an itinerary as a file. FROZEN contract:
 * GET /api/v1/itineraries/{id}/export?format=markdown|pdf -> file download.
 * Returns the raw Blob so callers can trigger a browser download.
 */
export async function exportItinerary(
  id: string,
  format: 'markdown' | 'pdf',
): Promise<Blob> {
  const qs = new URLSearchParams({ format })
  let res: Response
  try {
    res = await fetch(
      `${BASE}/itineraries/${encodeURIComponent(id)}/export?${qs.toString()}`,
    )
  } catch (err) {
    throw new ApiError(0, { error: 'network_error', detail: String(err) })
  }
  if (!res.ok) {
    throw new ApiError(res.status, await parseBody(res), null)
  }
  return res.blob()
}

/**
 * Create a public, read-only share link for an itinerary. FROZEN contract:
 * POST /api/v1/itineraries/{id}/share -> { token }.
 */
export function createShareLink(id: string): Promise<{ token: string }> {
  return request<{ token: string }>(
    `${BASE}/itineraries/${encodeURIComponent(id)}/share`,
    { method: 'POST' },
  )
}

/**
 * Fetch a shared itinerary by its public token. FROZEN contract:
 * GET /api/v1/shared/{token} -> read-only ItineraryResponse.
 */
export function getSharedItinerary(token: string): Promise<ItineraryResponse> {
  return request<ItineraryResponse>(`${BASE}/shared/${encodeURIComponent(token)}`)
}

/**
 * Stream an itinerary generation as it is produced. FROZEN contract:
 * POST /api/v1/itineraries/stream -> text/event-stream. Each text chunk is
 * delivered via ``onChunk``; the promise resolves with the final
 * ItineraryResponse parsed from the terminal ``done`` event.
 *
 * Implemented over fetch + ReadableStream (EventSource cannot POST a body). The
 * server is expected to emit SSE ``data:`` lines, the last carrying the full
 * ItineraryResponse JSON.
 */
export async function streamItinerary(
  prefs: TravelPreferences,
  onChunk: (chunk: string) => void,
): Promise<ItineraryResponse> {
  let res: Response
  try {
    res = await fetch(`${BASE}/itineraries/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(prefs),
    })
  } catch (err) {
    throw new ApiError(0, { error: 'network_error', detail: String(err) })
  }
  if (!res.ok || !res.body) {
    throw new ApiError(res.status, await parseBody(res), extractRetryAfter(res, null))
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let lastData = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let nl: number
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trimEnd()
      buffer = buffer.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trimStart()
      if (!data) continue
      lastData = data
      onChunk(data)
    }
  }

  try {
    return JSON.parse(lastData) as ItineraryResponse
  } catch {
    throw new ApiError(502, { error: 'parse_error', detail: 'stream did not end with itinerary JSON' })
  }
}
