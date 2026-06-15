import { Link } from 'react-router-dom'
import { Container, Section, Reveal } from '../components/ui'

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
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-accent-600">
                How it works
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-ink">
                From hobbies to a finished itinerary
              </h1>
              <p className="mx-auto mt-3 max-w-xl leading-relaxed text-ink-faint">
                Travel AI turns what you enjoy into a trip you can actually take — in three steps.
              </p>
            </header>
          </Reveal>

          <ol className="mt-12 space-y-5">
            {STEPS.map((step) => (
              <Reveal key={step.n}>
                <li className="flex gap-5 rounded-2xl border border-ink-line/80 bg-canvas-raised p-6 shadow-sm sm:p-7">
                  <span className="text-2xl font-semibold tabular-nums text-accent-400">
                    {step.n}
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold text-ink">{step.title}</h2>
                    <p className="mt-1.5 leading-relaxed text-ink-faint">{step.body}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>

          <Reveal>
            <div className="mt-12 text-center">
              <Link
                to="/discover"
                className="inline-flex items-center gap-2 rounded-full bg-accent-600 px-6 py-2.5 text-sm font-semibold text-canvas-raised shadow-sm transition hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2"
              >
                Start planning
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </Reveal>
        </div>
      </Section>
    </Container>
  )
}
