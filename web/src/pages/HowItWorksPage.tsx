import { Button, Container, Section, Reveal } from '../components/ui'

interface Step {
  n: string
  title: string
  body: string
}

const STEPS: Step[] = [
  {
    n: '01',
    title: 'Share your hobbies',
    body: 'Tell us what you love — food, art, hiking, nightlife — along with your dates, pace, and budget. No long forms; just the things that make a trip yours.',
  },
  {
    n: '02',
    title: 'Get matched destinations',
    body: 'We map your interests to places that fit them, weighing season, style, and budget so the suggestions feel made for you rather than pulled from a generic top-ten list.',
  },
  {
    n: '03',
    title: 'Receive a day-by-day itinerary',
    body: 'A complete plan arrives in seconds — activities, timing, and cost estimates per day, with map and booking links where available. Save the ones you love.',
  },
]

export default function HowItWorksPage() {
  return (
    <Container>
      <Section>
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <header className="text-center">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent-700">
                How it works
              </p>
              <h1 className="mt-4 font-serif text-5xl font-medium leading-[1.05] tracking-tight text-ink sm:text-6xl">
                From hobbies to a finished itinerary
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
                Travel AI turns what you enjoy into a trip you can actually take — in three steps.
              </p>
            </header>
          </Reveal>

          <ol className="mt-12 space-y-5">
            {STEPS.map((step, i) => (
              <Reveal
                key={step.n}
                as="li"
                index={i}
                className="flex gap-6 rounded-2xl border border-ink-line bg-canvas-raised p-6 shadow-frame sm:p-8"
              >
                <span className="font-serif text-4xl font-medium leading-none tabular-nums text-accent-500">
                  {step.n}
                </span>
                <div>
                  <h2 className="font-serif text-2xl font-medium tracking-tight text-ink">
                    {step.title}
                  </h2>
                  <p className="mt-2 leading-relaxed text-ink-soft">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>

          <Reveal>
            <div className="mt-12 text-center">
              <Button to="/discover" size="lg">
                Start planning <span aria-hidden="true">→</span>
              </Button>
            </div>
          </Reveal>
        </div>
      </Section>
    </Container>
  )
}
