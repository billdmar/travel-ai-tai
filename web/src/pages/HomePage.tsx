import { Link } from 'react-router-dom'
import heroImage from '../assets/hero.webp'
import {
  Button,
  Container,
  ParallaxLayer,
  Reveal,
  Section,
} from '../components/ui'

const STEPS = [
  {
    n: '01',
    title: 'Tell us what moves you',
    body: 'Pick the things you love — hiking, food, history, diving — and add a note in your own words.',
  },
  {
    n: '02',
    title: 'Discover where to go',
    body: 'We match your interests to four to six destinations, each with a reason it fits you.',
  },
  {
    n: '03',
    title: 'Get a day-by-day plan',
    body: 'Choose one and receive a structured itinerary with places, timing, costs, and maps.',
  },
]

export default function HomePage() {
  return (
    <>
      {/* Hero — cinematic, framed, with a parallax backdrop. */}
      <Section as="div" size="spacious" className="relative overflow-hidden">
        <ParallaxLayer
          speed={0.35}
          className="pointer-events-none absolute inset-0 -z-10"
        >
          <img
            src={heroImage}
            alt=""
            aria-hidden="true"
            className="h-[120%] w-full object-cover opacity-90"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-canvas/30 via-canvas/60 to-canvas" />
        </ParallaxLayer>

        <Container className="relative">
          <div className="max-w-2xl">
            <Reveal>
              <p className="mb-4 text-sm font-medium uppercase tracking-[0.18em] text-accent-700">
                Travel planning, considered
              </p>
            </Reveal>
            <Reveal index={1}>
              <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tightish text-ink sm:text-6xl">
                Trips that begin with what you love.
              </h1>
            </Reveal>
            <Reveal index={2}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
                Travel AI turns your interests into a destination worth the
                flight — then into an honest, day-by-day plan you can actually
                follow.
              </p>
            </Reveal>
            <Reveal index={3}>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <Button to="/discover" size="lg">
                  Start discovering →
                </Button>
                <Link
                  to="/how-it-works"
                  className="text-sm font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline"
                >
                  How it works
                </Link>
              </div>
            </Reveal>
          </div>
        </Container>
      </Section>

      {/* How it works — staggered reveal. */}
      <Section className="bg-canvas-raised">
        <Container>
          <Reveal>
            <h2 className="max-w-xl text-3xl font-semibold tracking-tightish text-ink sm:text-4xl">
              Three steps, no spreadsheets.
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <Reveal key={step.n} index={i} as="article">
                <div className="flex h-full flex-col rounded-2xl border border-ink-line bg-canvas p-7">
                  <span className="text-sm font-semibold tracking-[0.2em] text-accent-500">
                    {step.n}
                  </span>
                  <h3 className="mt-4 text-xl font-semibold tracking-tightish text-ink">
                    {step.title}
                  </h3>
                  <p className="mt-3 leading-relaxed text-ink-soft">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* Closing CTA. */}
      <Section size="spacious">
        <Container>
          <Reveal>
            <div className="overflow-hidden rounded-3xl bg-accent-600 px-8 py-16 text-center shadow-lift sm:px-16">
              <h2 className="text-balance text-3xl font-semibold tracking-tightish text-white sm:text-4xl">
                Ready when you are.
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-accent-50/90">
                It takes about a minute. No account, no clutter — just a plan
                shaped around you.
              </p>
              <div className="mt-8 flex justify-center">
                <Button to="/discover" variant="secondary" size="lg">
                  Discover destinations
                </Button>
              </div>
            </div>
          </Reveal>
        </Container>
      </Section>
    </>
  )
}
