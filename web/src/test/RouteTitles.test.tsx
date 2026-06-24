import { afterEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RouteTitles from '../seo/RouteTitles'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RouteTitles />
    </MemoryRouter>,
  )
}

function metaContent(selector: string): string | null {
  return document.head.querySelector(selector)?.getAttribute('content') ?? null
}

describe('RouteTitles', () => {
  afterEach(() => {
    document.title = ''
  })

  it('uses the verbatim brand title on the home route', () => {
    renderAt('/')
    expect(document.title).toBe('Travel AI (TAI) — Personalized Itineraries')
  })

  it('appends the brand suffix on inner routes', () => {
    renderAt('/discover')
    expect(document.title).toBe('Find Destinations | Travel AI (TAI)')
  })

  it('matches dynamic routes including the new surfaces', () => {
    renderAt('/destination/kyoto')
    expect(document.title).toBe('Destination Guide | Travel AI (TAI)')
  })

  it('titles the public share route', () => {
    renderAt('/share/abc123')
    expect(document.title).toBe('Shared Itinerary | Travel AI (TAI)')
  })

  it('falls back to a not-found title on an unknown route', () => {
    renderAt('/no-such-page')
    expect(document.title).toBe('Page Not Found | Travel AI (TAI)')
  })

  it('writes per-route description and Open Graph / Twitter title tags', () => {
    renderAt('/explore')
    expect(metaContent('meta[name="description"]')).toMatch(/curated destinations/i)
    expect(metaContent('meta[property="og:title"]')).toBe(
      'Explore Destinations | Travel AI (TAI)',
    )
    expect(metaContent('meta[name="twitter:title"]')).toBe(
      'Explore Destinations | Travel AI (TAI)',
    )
  })
})
