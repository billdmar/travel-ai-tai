import { Link } from 'react-router-dom'
import heroImage from '../assets/hero.webp'
import { Button, Container, ParallaxLayer, Reveal, Section } from './ui'

// STUB — the existing home hero markup, lifted out of HomePage verbatim so the
// home page still renders during the overhaul. Terminal 1 replaces this with
// the showpiece photo hero (Ken Burns cross-fade, masked headline) driven by
// the HERO_SLIDES manifest at ../assets/hero. Keep the default export.
export default function Hero() {
  return (
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
              Travel AI turns your interests into a destination worth the flight
              — then into an honest, day-by-day plan you can actually follow.
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
  )
}
