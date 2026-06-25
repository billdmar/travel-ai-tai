import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import MapView from '../components/MapView'
import type { Activity, ItineraryDay } from '../types/itinerary'

// Leaflet needs real DOM measurements and tile network calls that jsdom can't
// provide; we only assert MapView's own branching (empty state vs. a rendered
// map region), so stub the leaflet module with a minimal map/marker spy.
const { mapFactory } = vi.hoisted(() => {
  const fitBounds = vi.fn()
  const setView = vi.fn()
  const markerAdds: number[] = []
  return {
    mapFactory: { fitBounds, setView, markerAdds },
  }
})

vi.mock('leaflet', () => {
  const marker = () => {
    mapFactory.markerAdds.push(1)
    const m = {
      addTo: () => m,
      bindPopup: () => m,
    }
    return m
  }
  const tileLayer = () => ({ addTo: () => undefined })
  const map = () => ({
    fitBounds: mapFactory.fitBounds,
    setView: mapFactory.setView,
    remove: () => undefined,
  })
  return {
    default: {
      Icon: { Default: { mergeOptions: () => undefined } },
      map,
      tileLayer,
      marker,
      latLngBounds: (v: unknown) => v,
    },
  }
})

// Side-effect CSS / image imports leaflet pulls in — stub so jsdom doesn't choke.
vi.mock('leaflet/dist/leaflet.css', () => ({}))
vi.mock('leaflet/dist/images/marker-icon-2x.png', () => ({ default: 'icon2x' }))
vi.mock('leaflet/dist/images/marker-icon.png', () => ({ default: 'icon' }))
vi.mock('leaflet/dist/images/marker-shadow.png', () => ({ default: 'shadow' }))

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    time: '09:00',
    place: 'Fushimi Inari',
    description: 'Torii gates.',
    estimated_cost_usd: 0,
    category: 'attraction',
    map_url: 'https://maps.example/x',
    ...overrides,
  }
}

function day(activities: Activity[]): ItineraryDay {
  return { day_number: 1, date: '2026-07-01', theme: 'Temples', activities }
}

describe('MapView', () => {
  it('renders the empty state when no activity carries coordinates', () => {
    render(<MapView days={[day([activity(), activity({ place: 'No coords' })])]} />)
    expect(screen.getByText('No map locations yet')).toBeInTheDocument()
    // No map region is mounted in the empty state.
    expect(
      screen.queryByRole('region', { name: /Map of itinerary activities/ }),
    ).not.toBeInTheDocument()
  })

  it('mounts the map region and a marker per activity that has coords', () => {
    mapFactory.markerAdds.length = 0
    mapFactory.fitBounds.mockClear()
    render(
      <MapView
        days={[
          day([
            activity({ place: 'A', lat: 35.0, lng: 135.7 }),
            activity({ place: 'B', lat: 35.01, lng: 135.71 }),
            activity({ place: 'No coords' }), // skipped — no lat/lng
          ]),
        ]}
      />,
    )
    expect(
      screen.getByRole('region', { name: /Map of itinerary activities/ }),
    ).toBeInTheDocument()
    // Two coord-bearing activities -> two markers; the third is skipped.
    expect(mapFactory.markerAdds.length).toBe(2)
    // Multiple markers -> fit to bounds (single-marker path uses setView).
    expect(mapFactory.fitBounds).toHaveBeenCalledTimes(1)
  })
})
