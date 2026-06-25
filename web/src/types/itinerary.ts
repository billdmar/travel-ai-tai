// TypeScript interfaces mirroring the backend Pydantic models exactly.

export type Pace = 'relaxed' | 'moderate' | 'packed'
export type TravelStyle = 'budget' | 'midrange' | 'luxury'
export type ActivityCategory =
  | 'food'
  | 'attraction'
  | 'transport'
  | 'accommodation'
  | 'leisure'
  | 'other'

export interface TravelPreferences {
  destination: string
  start_date: string // YYYY-MM-DD
  end_date: string // YYYY-MM-DD
  budget_usd: number
  interests: string[]
  pace: Pace
  travel_style: TravelStyle
  dietary_needs: string[]
  accessibility_needs: string[]
  group_size: number
  notes?: string | null
}

export interface Activity {
  time: string
  place: string
  description: string
  estimated_cost_usd: number
  category: ActivityCategory
  map_url: string
  // Optional geographic coordinates for the interactive map view. Null/absent
  // when the model didn't supply them (or for itineraries stored before the
  // field existed) — only activities with both are plotted as markers.
  lat?: number | null
  lng?: number | null
  // Optional affiliate/booking deep link (Terminal 4 backend may populate it).
  booking_url?: string
}

export interface ItineraryDay {
  day_number: number
  date: string
  theme: string
  activities: Activity[]
}

export interface ItineraryResponse {
  id: string
  created_at: string
  preferences: TravelPreferences
  days: ItineraryDay[]
  total_estimated_cost_usd: number
  currency: string
  summary: string
  tips: string[]
  provider: string
  tokens_used: number | null
  saved: boolean
}

export interface ItineraryListItem {
  id: string
  created_at: string
  destination: string
  start_date: string
  end_date: string
  total_estimated_cost_usd: number
}

export interface ItineraryListResponse {
  page: number
  per_page: number
  total: number
  items: ItineraryListItem[]
}

export interface ValidateResponse {
  valid: boolean
}
