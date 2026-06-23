import { useMemo, useState } from 'react'
import { Container, Section, Reveal, Button } from '../components/ui'
import {
  DESTINATIONS,
  VIBES,
  DestinationCard,
  VibeFilter,
} from '../components/explore'
import type { Vibe } from '../components/explore'

/**
 * Explore — a framed photography gallery of curated destinations, filterable by
 * vibe. Each card opens an immersive landing page (/destination/:slug). Built
 * from ui/ primitives + the bundled image library; scroll-reveals and the card
 * hover zoom are reduced-motion safe.
 */
export default function ExplorePage() {
  const [activeVibe, setActiveVibe] = useState<Vibe | null>(null)

  const visible = useMemo(
    () =>
      activeVibe
        ? DESTINATIONS.filter((d) => d.vibes.includes(activeVibe))
        : DESTINATIONS,
    [activeVibe],
  )

  return (
    <>
      {/* Editorial header band. */}
      <Section size="cozy" className="pb-2 sm:pb-4">
        <Container>
          <Reveal>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent-700">
              Explore
            </p>
            <h1 className="mt-4 max-w-3xl font-serif text-5xl font-medium leading-[1.06] tracking-tight text-ink sm:text-6xl">
              Somewhere worth the flight
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">
              A curated atlas of places we love — coastlines, capitals, and quiet
              corners. Browse by the mood you’re after, then step inside any one
              to start planning.
            </p>
          </Reveal>

          <Reveal>
            <div className="mt-8">
              <VibeFilter vibes={VIBES} active={activeVibe} onChange={setActiveVibe} />
            </div>
          </Reveal>
        </Container>
      </Section>

      {/* Gallery grid. */}
      <Section size="cozy" className="pt-4 sm:pt-6">
        <Container>
          {visible.length > 0 ? (
            <ul
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
              aria-label="Destinations"
            >
              {visible.map((dest, i) => (
                <li key={dest.slug} className="h-full">
                  <DestinationCard destination={dest} index={i % 6} />
                </li>
              ))}
            </ul>
          ) : (
            <Reveal>
              <p className="text-ink-soft">
                No destinations match that vibe yet — try another.
              </p>
            </Reveal>
          )}
        </Container>
      </Section>

      {/* Closing CTA. */}
      <Section size="default" className="bg-canvas-sunken">
        <Container>
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-serif text-3xl font-medium leading-tight tracking-tight text-ink sm:text-4xl">
                Not sure where to start?
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-ink-soft">
                Tell us what you love to do and we’ll match you to destinations —
                then build the day-by-day plan.
              </p>
              <div className="mt-8 flex justify-center">
                <Button to="/discover" size="lg">
                  Find my destination <span aria-hidden="true">→</span>
                </Button>
              </div>
            </div>
          </Reveal>
        </Container>
      </Section>
    </>
  )
}
