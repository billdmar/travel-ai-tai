import Hero from '../components/Hero'
import {
  Container,
  MagneticButton,
  Reveal,
  ScrollScale,
  Section,
  grainOverlayStyle,
  softGlow,
  variableSerif,
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

// The "why TAI" story — three quiet promises that frame the product's intent.
const STORY = [
  {
    kicker: 'Made for you',
    title: 'Not a list of everywhere.',
    body: 'Most tools hand you the same ranked cities. We start from what you actually love and work outward — so the shortlist already feels like yours.',
  },
  {
    kicker: 'Worth the flight',
    title: 'A reason, not just a pin.',
    body: 'Every destination comes with why it fits you — the season, the texture of the place, the thing you came for. You decide with context, not a coin flip.',
  },
  {
    kicker: 'Down to the day',
    title: 'From idea to itinerary.',
    body: 'Pick one and it becomes a structured plan: places, timing, costs, and maps — shaped around your pace and your budget, ready to refine.',
  },
]

export default function HomePage() {
  return (
    <>
      {/* Hero — the photo showpiece: Ken Burns cross-fade + masked headline. */}
      <Hero />

      {/* How it works — staggered reveal over a faintly grained surface. */}
      <Section className="relative isolate overflow-hidden bg-canvas-raised">
        <div aria-hidden className="absolute inset-0 -z-10" style={grainOverlayStyle} />
        <Container>
          <Reveal>
            <h2
              className="max-w-xl font-serif text-3xl font-medium tracking-tightish text-ink sm:text-4xl"
              style={variableSerif(540)}
            >
              Three steps, no spreadsheets.
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <Reveal key={step.n} index={i} as="article">
                <div className="flex h-full flex-col rounded-2xl border border-ink-line bg-canvas p-7 transition-shadow duration-hover ease-lux hover:shadow-frame">
                  <span className="text-sm font-semibold tracking-[0.2em] text-accent-500">
                    {step.n}
                  </span>
                  <h3 className="mt-4 font-serif text-xl font-medium tracking-tightish text-ink">
                    {step.title}
                  </h3>
                  <p className="mt-3 leading-relaxed text-ink-soft">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* Why TAI — the story band: three quiet promises, scroll-settled. */}
      <Section className="relative isolate overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={softGlow('top-right')}
        />
        <Container>
          <Reveal>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent-700">
              Why Travel AI
            </p>
            <h2
              className="mt-4 max-w-2xl text-balance font-serif text-3xl font-medium leading-tight tracking-tightish text-ink sm:text-5xl"
              style={variableSerif(520)}
            >
              Planning a trip should feel like anticipation, not admin.
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-12 sm:grid-cols-3">
            {STORY.map((item, i) => (
              <ScrollScale key={item.kicker} amount={0.05}>
                <Reveal index={i} as="article">
                  <div className="flex h-full flex-col border-t border-ink-line pt-6">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-600">
                      {item.kicker}
                    </span>
                    <h3 className="mt-4 font-serif text-2xl font-medium leading-snug tracking-tightish text-ink">
                      {item.title}
                    </h3>
                    <p className="mt-3 leading-relaxed text-ink-soft">{item.body}</p>
                  </div>
                </Reveal>
              </ScrollScale>
            ))}
          </div>
        </Container>
      </Section>

      {/* Closing CTA — soft glow behind the panel, magnetic primary action. */}
      <Section size="spacious">
        <Container>
          <Reveal>
            <ScrollScale amount={0.03}>
              <div className="relative isolate overflow-hidden rounded-3xl bg-accent-600 px-8 py-16 text-center shadow-lift sm:px-16">
                <div
                  aria-hidden
                  className="absolute inset-0 -z-10"
                  style={softGlow('bottom', 'rgba(255,255,255,0.10)')}
                />
                <h2
                  className="text-balance font-serif text-3xl font-medium tracking-tightish text-white sm:text-4xl"
                  style={variableSerif(540)}
                >
                  Ready when you are.
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-accent-50/90">
                  It takes about a minute. No account, no clutter — just a plan
                  shaped around you.
                </p>
                <div className="mt-8 flex justify-center">
                  <MagneticButton to="/discover" aria-label="Discover destinations">
                    <span className="inline-flex items-center justify-center gap-2 rounded-full bg-canvas-raised px-8 py-3.5 text-base font-medium tracking-tightish text-accent-700 shadow-frame transition-[transform,box-shadow] duration-hover ease-lux hover:shadow-lift">
                      Discover destinations
                    </span>
                  </MagneticButton>
                </div>
              </div>
            </ScrollScale>
          </Reveal>
        </Container>
      </Section>
    </>
  )
}
