import { Link, useNavigate, useParams } from 'react-router-dom'
import { Container, Section, Reveal, Button } from '../components/ui'
import { DestinationImage } from '../components/DestinationImage'
import { getDestinationBySlug, DESTINATIONS } from '../components/explore'
import type { PlanLocationState } from '../types/discovery'

/**
 * Immersive per-destination landing page (/destination/:slug). Full-bleed hero
 * photo, serif title, editorial story copy, quick facts, and a "plan a trip
 * here" CTA that seeds the existing plan flow with a recommendation built from
 * curated data. Falls back to a guided recovery view for unknown slugs.
 */
export default function DestinationLandingPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const dest = slug ? getDestinationBySlug(slug) : undefined

  if (!dest) {
    return <UnknownDestination slug={slug} />
  }

  const { name, country, query, tagline, bestSeason, vibes, story } = dest

  // Seed the plan flow exactly like ResultsPage does, so /plan shows the
  // country and the itinerary request carries the destination forward.
  const planTo = `/plan/${encodeURIComponent(name)}`
  const planState: PlanLocationState = {
    hobbies: [],
    recommendation: {
      name,
      country,
      why_it_fits: tagline,
      tags: vibes,
      image_query: query,
      best_season: bestSeason,
    },
  }

  const goPlan = () => navigate(planTo, { state: planState })

  // A few other curated places to keep exploring.
  const more = DESTINATIONS.filter((d) => d.slug !== dest.slug).slice(0, 3)

  return (
    <>
      {/* Full-bleed hero. */}
      <header className="relative">
        <DestinationImage
          query={query}
          alt={`${name}, ${country}`}
          aspect="aspect-[3/4] sm:aspect-[16/9] lg:aspect-[21/9]"
          eager
          showCredit
          className="rounded-none ring-0 shadow-none"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/25 to-transparent"
        />
        <Container className="absolute inset-x-0 bottom-0">
          <div className="max-w-3xl pb-10 sm:pb-14">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-canvas/85">
              {country}
            </p>
            <h1 className="mt-3 font-serif text-5xl font-medium leading-[1.04] tracking-tight text-canvas sm:text-7xl">
              {name}
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-canvas/90">
              {tagline}
            </p>
          </div>
        </Container>
      </header>

      {/* Story + quick facts. */}
      <Section>
        <Container>
          <div className="grid gap-12 lg:grid-cols-[1.6fr_1fr] lg:gap-16">
            <Reveal>
              <div className="space-y-5 text-lg leading-relaxed text-ink-soft">
                {story.map((para) => (
                  <p key={para.slice(0, 24)}>{para}</p>
                ))}
              </div>
            </Reveal>

            <Reveal index={1}>
              <aside className="rounded-2xl border border-ink-line bg-canvas-raised p-7 shadow-frame">
                <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-faint">
                  Quick facts
                </h2>
                <dl className="mt-4 space-y-4 text-sm">
                  <div>
                    <dt className="font-medium text-ink">Best time to go</dt>
                    <dd className="mt-1 leading-relaxed text-ink-soft">
                      {bestSeason}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-ink">Known for</dt>
                    <dd className="mt-2 flex flex-wrap gap-2">
                      {vibes.map((v) => (
                        <span
                          key={v}
                          className="rounded-full border border-ink-line bg-canvas px-3 py-1 text-xs font-medium text-ink-soft"
                        >
                          {v}
                        </span>
                      ))}
                    </dd>
                  </div>
                </dl>
                <div className="mt-7">
                  <Button onClick={goPlan} size="lg" className="w-full">
                    Plan a trip here <span aria-hidden="true">→</span>
                  </Button>
                  <Link
                    to="/explore"
                    className="mt-4 block text-center text-sm font-medium text-accent-600 underline-offset-4 hover:underline"
                  >
                    Back to all destinations
                  </Link>
                </div>
              </aside>
            </Reveal>
          </div>
        </Container>
      </Section>

      {/* Keep exploring. */}
      <Section size="default" className="bg-canvas-sunken">
        <Container>
          <Reveal>
            <h2 className="font-serif text-3xl font-medium leading-tight tracking-tight text-ink sm:text-4xl">
              Keep exploring
            </h2>
          </Reveal>
          <ul className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {more.map((d, i) => (
              <li key={d.slug}>
                <Reveal as="article" index={i}>
                  <Link
                    to={`/destination/${d.slug}`}
                    className="group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas-sunken"
                  >
                    <div className="relative overflow-hidden rounded-2xl">
                      <DestinationImage
                        query={d.query}
                        alt={`${d.name}, ${d.country}`}
                        aspect="aspect-[4/3]"
                        showCredit={false}
                        className="motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-lux motion-safe:group-hover:scale-[1.04]"
                      />
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-t from-ink/65 to-transparent"
                      />
                      <div className="absolute inset-x-0 bottom-0 p-4">
                        <h3 className="font-serif text-xl font-medium text-canvas">
                          {d.name}
                        </h3>
                        <p className="text-sm text-canvas/85">{d.country}</p>
                      </div>
                    </div>
                  </Link>
                </Reveal>
              </li>
            ))}
          </ul>
        </Container>
      </Section>
    </>
  )
}

/** Guided recovery for an unrecognized slug — no blank page. */
function UnknownDestination({ slug }: { slug?: string }) {
  return (
    <Container>
      <Section>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent-700">
            Not in our atlas yet
          </p>
          <h1 className="mt-4 font-serif text-4xl font-medium leading-[1.1] tracking-tight text-ink sm:text-5xl">
            We don’t have a guide for {slug ? `“${slug}”` : 'that place'} — yet
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-ink-soft">
            Browse the destinations we’ve curated, or tell us what you love and
            we’ll find somewhere that fits.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Button to="/explore" size="lg">
              Explore destinations
            </Button>
            <Button to="/discover" variant="secondary" size="lg">
              Find my destination
            </Button>
          </div>
        </div>
      </Section>
    </Container>
  )
}
