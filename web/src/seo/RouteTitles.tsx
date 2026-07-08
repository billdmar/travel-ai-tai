import { matchPath, useLocation } from 'react-router-dom'
import { DEFAULT_DESCRIPTION, useDocumentTitle } from './useDocumentTitle'

interface RouteMeta {
  /** Bare page title; the brand suffix is appended by useDocumentTitle. */
  title: string
  description?: string
  /** When true, `title` is used verbatim (no " | Travel AI (TAI)" suffix). */
  exactTitle?: boolean
}

/**
 * Route pattern -> metadata. Order matters: the first matching pattern wins,
 * so concrete paths precede dynamic ones. Patterns mirror App.tsx exactly,
 * including the new /explore, /destination/:slug and /share/:token surfaces.
 */
const ROUTE_META: ReadonlyArray<readonly [string, RouteMeta]> = [
  [
    '/',
    {
      title: 'Travel AI (TAI) — Personalized Itineraries',
      description: DEFAULT_DESCRIPTION,
      exactTitle: true,
    },
  ],
  [
    '/discover',
    {
      title: 'Find Destinations',
      description:
        'Tell us your interests and let Travel AI suggest destinations worth the flight.',
    },
  ],
  [
    '/results',
    {
      title: 'Destinations for You',
      description: 'AI-matched destinations based on the interests you shared.',
    },
  ],
  [
    '/plan/:destination',
    {
      title: 'Plan Your Trip',
      description: 'Set your dates, budget, and pace to generate a tailored itinerary.',
    },
  ],
  [
    '/itinerary/:id',
    {
      title: 'Your Itinerary',
      description: 'A day-by-day itinerary tailored to your trip preferences.',
    },
  ],
  [
    '/saved',
    {
      title: 'Saved Trips',
      description: 'Your saved itineraries, ready to revisit and refine.',
    },
  ],
  [
    '/compare',
    {
      title: 'Compare Trips',
      description: 'Saved itineraries side by side — days, budget, and pace at a glance.',
    },
  ],
  [
    '/explore',
    {
      title: 'Explore Destinations',
      description:
        'Browse curated destinations and discover where your next trip could take you.',
    },
  ],
  [
    '/destination/:slug',
    {
      title: 'Destination Guide',
      description: 'Photos, seasons, and reasons this destination might be right for you.',
    },
  ],
  [
    '/share/:token',
    {
      title: 'Shared Itinerary',
      description: 'A read-only itinerary shared with you via Travel AI.',
    },
  ],
  [
    '/how-it-works',
    {
      title: 'How It Works',
      description: 'How Travel AI turns your interests into a day-by-day itinerary.',
    },
  ],
  [
    '/about',
    {
      title: 'About Travel AI',
      description: 'About Travel AI (TAI), the LLM-powered itinerary generator.',
    },
  ],
  [
    '/disclosure',
    {
      title: 'Disclosure',
      description: 'Affiliate and AI-content disclosures for Travel AI.',
    },
  ],
]

const FALLBACK: RouteMeta = {
  title: 'Page Not Found',
  description: DEFAULT_DESCRIPTION,
}

function metaForPath(pathname: string): RouteMeta {
  for (const [pattern, meta] of ROUTE_META) {
    if (matchPath({ path: pattern, end: true }, pathname)) return meta
  }
  return FALLBACK
}

/**
 * Per-route document head manager, mounted once inside <App>. Resolves the
 * current pathname to its metadata and drives useDocumentTitle, which keeps
 * <title>, description, canonical, and OG/Twitter tags in sync on navigation.
 */
export default function RouteTitles(): null {
  const { pathname } = useLocation()
  const meta = metaForPath(pathname)
  useDocumentTitle(meta.title, meta.description, { brand: !meta.exactTitle })
  return null
}
