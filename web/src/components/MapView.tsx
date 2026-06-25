import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
// Vite fingerprints assets, so Leaflet's default icon URLs (which it derives
// from its own script path) 404. Import the marker images as URLs and pin them
// onto the default icon so markers render under the bundler.
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import type { ItineraryDay } from '../types/itinerary'

/**
 * Escape a string for safe interpolation into Leaflet popup HTML. Place names
 * come from the LLM, so they are untrusted; Leaflet's `bindPopup` renders raw
 * HTML, so we neutralize the five significant characters before injecting.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

interface MapViewProps {
  days: ItineraryDay[]
}

/** A plottable activity: one that carries both finite numeric coordinates. */
interface MapPoint {
  lat: number
  lng: number
  title: string
  time: string
}

/** Flatten the itinerary to just the activities that can be placed on a map. */
function collectPoints(days: ItineraryDay[]): MapPoint[] {
  const points: MapPoint[] = []
  for (const day of days) {
    for (const a of day.activities) {
      if (typeof a.lat === 'number' && typeof a.lng === 'number') {
        points.push({ lat: a.lat, lng: a.lng, title: a.place, time: a.time })
      }
    }
  }
  return points
}

/**
 * Interactive Leaflet map plotting every activity that has coordinates as a
 * marker (popup = time + place), auto-fitting the view to the markers' bounds.
 * Uses keyless OpenStreetMap tiles. Renders a graceful empty state when no
 * activity carries coordinates, so the toggle never shows a blank map.
 *
 * Lazy-imported by ItineraryView so Leaflet lands in its own code-split chunk
 * rather than the main bundle.
 */
export default function MapView({ days }: MapViewProps) {
  const points = useMemo(() => collectPoints(days), [days])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el || points.length === 0) return

    // Create the map once, then (re)draw markers whenever the points change.
    const map = L.map(el, { scrollWheelZoom: false })
    mapRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map)

    const latLngs: L.LatLngExpression[] = []
    for (const p of points) {
      latLngs.push([p.lat, p.lng])
      L.marker([p.lat, p.lng])
        .addTo(map)
        .bindPopup(
          `<strong>${escapeHtml(p.time)}</strong><br>${escapeHtml(p.title)}`,
        )
    }
    // Fit to all markers; a lone marker would yield a zero-area bounds, so fall
    // back to centering on it at a sensible city-scale zoom.
    if (latLngs.length === 1) {
      map.setView(latLngs[0], 13)
    } else {
      map.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40] })
    }

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [points])

  if (points.length === 0) {
    return (
      <div
        role="status"
        className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-ink-line bg-canvas-sunken px-6 py-16 text-center"
      >
        <svg
          aria-hidden="true"
          className="h-8 w-8 text-ink-faint"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.6}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <p className="text-sm font-medium text-ink-soft">No map locations yet</p>
        <p className="max-w-sm text-xs text-ink-faint">
          This itinerary doesn&rsquo;t include coordinates for its activities, so there&rsquo;s
          nothing to plot. Switch back to the list view to see the full plan.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Map of itinerary activities"
      className="h-[28rem] w-full overflow-hidden rounded-2xl border border-ink-line shadow-frame"
    />
  )
}
