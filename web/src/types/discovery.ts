// Types for the destination-discovery flow (Discover → Results → plan).
// Mirrors the FROZEN contracts shared by all four terminals:
//   POST /api/v1/destinations/recommend
//     req  { hobbies: string[]; free_text?: string }
//     resp { recommendations: DestinationRecommendation[ 4-6 ] }
//   GET  /api/v1/images?query=...
//     resp ImageResult

export interface RecommendRequest {
  hobbies: string[]
  free_text?: string
}

export interface DestinationRecommendation {
  name: string
  country: string
  why_it_fits: string
  tags: string[]
  image_query: string
  best_season: string
}

export interface RecommendResponse {
  recommendations: DestinationRecommendation[]
}

export interface ImageCredit {
  name: string
  link: string
}

export interface ImageResult {
  url: string | null
  thumb_url: string | null
  alt: string
  credit: ImageCredit | null
  fallback: boolean
}

// Router state passed Discover → Results, and Results → TripDetails.
export interface ResultsLocationState {
  hobbies: string[]
  free_text?: string
  recommendations: DestinationRecommendation[]
}

export interface PlanLocationState {
  hobbies: string[]
  recommendation?: DestinationRecommendation
}
