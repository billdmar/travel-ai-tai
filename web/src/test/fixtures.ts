// Shared test fixtures + a reusable mock of the api/client module.
//
// The itinerary fixtures mirror the backend's ItineraryResponse shape exactly
// (see ../types/itinerary). Builders take overrides so a test can vary just the
// field it cares about without restating the whole tree. Co-locating them here
// keeps the component/page specs short and consistent.

import { vi } from 'vitest'
import type {
  Activity,
  ItineraryDay,
  ItineraryListItem,
  ItineraryResponse,
  TravelPreferences,
} from '../types/itinerary'
import type {
  DestinationRecommendation,
  ImageResult,
} from '../types/discovery'

export function makePreferences(
  overrides: Partial<TravelPreferences> = {},
): TravelPreferences {
  return {
    destination: 'Kyoto',
    start_date: '2026-07-01',
    end_date: '2026-07-03',
    budget_usd: 2000,
    interests: ['food', 'history'],
    pace: 'moderate',
    travel_style: 'midrange',
    dietary_needs: [],
    accessibility_needs: [],
    group_size: 2,
    notes: null,
    ...overrides,
  }
}

export function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    time: '09:00',
    place: 'Fushimi Inari Shrine',
    description: 'Walk the vermilion torii gates before the crowds.',
    estimated_cost_usd: 0,
    category: 'attraction',
    map_url: 'https://maps.google.com/?q=Fushimi+Inari',
    ...overrides,
  }
}

export function makeDay(overrides: Partial<ItineraryDay> = {}): ItineraryDay {
  return {
    day_number: 1,
    date: '2026-07-01',
    theme: 'Temples & tea',
    activities: [
      makeActivity(),
      makeActivity({
        time: '13:00',
        place: 'Nishiki Market',
        description: 'Graze the covered market for lunch.',
        estimated_cost_usd: 40,
        category: 'food',
      }),
    ],
    ...overrides,
  }
}

export function makeItinerary(
  overrides: Partial<ItineraryResponse> = {},
): ItineraryResponse {
  return {
    id: 'it_test1',
    created_at: '2026-06-01T12:00:00Z',
    preferences: makePreferences(),
    days: [
      makeDay(),
      makeDay({
        day_number: 2,
        date: '2026-07-02',
        theme: 'Gardens & gion',
        activities: [
          makeActivity({
            time: '10:00',
            place: 'Ryoan-ji',
            estimated_cost_usd: 15,
            category: 'attraction',
          }),
        ],
      }),
    ],
    total_estimated_cost_usd: 55,
    currency: 'USD',
    summary: 'A measured three days through old Kyoto.',
    tips: ['Buy an IC card for transit.', 'Carry small cash for shrines.'],
    provider: 'mock',
    tokens_used: null,
    saved: false,
    ...overrides,
  }
}

export function makeListItem(
  overrides: Partial<ItineraryListItem> = {},
): ItineraryListItem {
  return {
    id: 'it_test1',
    created_at: '2026-06-01T12:00:00Z',
    destination: 'Kyoto',
    start_date: '2026-07-01',
    end_date: '2026-07-03',
    total_estimated_cost_usd: 55,
    ...overrides,
  }
}

export function makeRecommendation(
  overrides: Partial<DestinationRecommendation> = {},
): DestinationRecommendation {
  return {
    name: 'Kyoto',
    country: 'Japan',
    why_it_fits: 'Temple gardens and a deep food culture.',
    tags: ['food', 'history'],
    image_query: 'Kyoto, Japan',
    best_season: 'autumn',
    ...overrides,
  }
}

/** The synthetic fallback `fetchImage` returns when the live service fails. */
export function makeFallbackImage(query = 'photo'): ImageResult {
  return { url: null, thumb_url: null, alt: query, credit: null, fallback: true }
}

/**
 * Stub global fetch so the always-mounted <DestinationImage> resolves to its
 * bundled fallback instead of hitting the network. Returns the mock so a test
 * can inspect or override it. Pair with `vi.restoreAllMocks()` in afterEach.
 */
export function stubImageFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 503,
    headers: new Headers(),
    text: async () => '',
    blob: async () => new Blob([]),
  } as unknown as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
