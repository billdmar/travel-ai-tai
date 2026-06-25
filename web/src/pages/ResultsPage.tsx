import { Link, useLocation } from 'react-router-dom'
import { DestinationImage } from '../components/DestinationImage'
import type {
  DestinationRecommendation,
  PlanLocationState,
  ResultsLocationState,
} from '../types/discovery'
import {
  Button,
  Container,
  Reveal,
  ScrollScale,
  Section,
  softGlow,
  variableSerif,
} from '../components/ui'

export default function ResultsPage() {
  const location = useLocation()
  const state = location.state as ResultsLocationState | null

  // Direct navigation / refresh loses router state — guide the user back.
  if (!state || !state.recommendations?.length) {
    return (
      <Section>
        <Container narrow>
          <Reveal>
            <h1 className="font-serif text-4xl font-medium tracking-tight text-ink sm:text-5xl">
              Let’s start with your interests.
            </h1>
            <p className="mt-4 text-ink-soft">
              We need to know what you love before we can suggest where to go.
            </p>
            <div className="mt-8">
              <Button to="/discover" size="lg">
                Go to Discover →
              </Button>
            </div>
          </Reveal>
        </Container>
      </Section>
    )
  }

  const { hobbies, recommendations } = state

  // Each card is a real navigation, so render it as a router <Link> rather than
  // a click-handler button: that preserves native keyboard activation,
  // right-click "open in new tab", and link semantics for assistive tech, while
  // still carrying the plan state forward via the Link's `state` prop.
  const planState = (rec: DestinationRecommendation): PlanLocationState => ({
    hobbies,
    recommendation: rec,
  })

  return (
    <Section size="cozy" className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={softGlow('top-right')}
      />
      <Container>
        <Reveal>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent-700">
            Step 2 of 2
          </p>
          <h1
            className="mt-4 font-serif text-5xl font-medium leading-[1.05] tracking-tight text-ink sm:text-6xl"
            style={variableSerif(560)}
          >
            Destinations made for you.
          </h1>
          {hobbies.length > 0 ? (
            <p className="mt-4 text-lg text-ink-soft">
              Based on{' '}
              <span className="text-ink">{hobbies.join(', ').toLowerCase()}</span>.{' '}
              <Link
                to="/discover"
                className="text-accent-600 underline-offset-4 hover:underline"
              >
                Refine
              </Link>
            </p>
          ) : null}
        </Reveal>

        <div className="mt-12 grid gap-8 sm:grid-cols-2">
          {recommendations.map((rec, i) => (
            <Reveal key={`${rec.name}-${rec.country}`} index={i} as="article">
              <ScrollScale amount={0.04} className="h-full">
              <Link
                to={`/plan/${encodeURIComponent(rec.name)}`}
                state={planState(rec)}
                className="group flex h-full w-full flex-col overflow-hidden rounded-3xl border border-ink-line bg-canvas-raised text-left shadow-frame transition duration-hover ease-lux hover:-translate-y-1 hover:shadow-lift focus-visible:-translate-y-1 focus-visible:shadow-lift"
              >
                <DestinationImage
                  query={rec.image_query || `${rec.name} ${rec.country}`}
                  alt={`${rec.name}, ${rec.country}`}
                  aspect="aspect-[16/10]"
                  className="rounded-none"
                />
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="font-serif text-3xl font-medium leading-tight tracking-tight text-ink">
                      {rec.name}
                    </h2>
                    <span className="shrink-0 text-sm text-ink-faint">
                      {rec.country}
                    </span>
                  </div>
                  <p className="mt-3 leading-relaxed text-ink-soft">
                    {rec.why_it_fits}
                  </p>
                  {rec.tags?.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {rec.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-accent-50 px-2.5 py-1 text-xs font-medium text-accent-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-6 flex items-center justify-between border-t border-ink-line pt-4">
                    {rec.best_season ? (
                      <span className="text-sm text-ink-faint">
                        Best in {rec.best_season}
                      </span>
                    ) : (
                      <span />
                    )}
                    <span className="text-sm font-medium text-accent-600 transition-transform group-hover:translate-x-0.5">
                      Plan this trip →
                    </span>
                  </div>
                </div>
              </Link>
              </ScrollScale>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  )
}
