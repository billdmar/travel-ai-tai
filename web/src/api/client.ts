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
