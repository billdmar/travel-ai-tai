import Hero from '../components/Hero'
import { Button, Container, Reveal, Section } from '../components/ui'

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
      {/* Hero — the photo showpiece: Ken Burns cross-fade + masked headline. */}
      <Hero />

      {/* How it works — staggered reveal. */}
      <Section className="bg-canvas-raised">
        <Container>
          <Reveal>
            <h2 className="max-w-xl font-serif text-3xl font-medium tracking-tightish text-ink sm:text-4xl">
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

      {/* Closing CTA. */}
      <Section size="spacious">
        <Container>
          <Reveal>
            <div className="overflow-hidden rounded-3xl bg-accent-600 px-8 py-16 text-center shadow-lift sm:px-16">
              <h2 className="text-balance font-serif text-3xl font-medium tracking-tightish text-white sm:text-4xl">
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
