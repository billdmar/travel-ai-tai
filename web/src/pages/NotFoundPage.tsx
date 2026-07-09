import { Link } from 'react-router-dom'
import { Container, Section, Reveal, MagneticButton, variableSerif } from '../components/ui'

export default function NotFoundPage() {
  return (
    <Container>
      <Section>
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <Reveal>
            <p
              className="font-serif text-[8rem] font-medium leading-none tracking-tight text-accent-500/30 sm:text-[10rem]"
              style={variableSerif(400)}
              aria-hidden="true"
            >
              404
            </p>
          </Reveal>

          <Reveal>
            <h1 className="mt-4 font-serif text-4xl font-medium leading-[1.12] tracking-tight text-ink sm:text-5xl">
              We looked everywhere.
            </h1>
          </Reveal>

          <Reveal>
            <p className="mt-5 text-lg leading-relaxed text-ink-soft">
              This page doesn't exist — but a great trip might be one click away.
            </p>
          </Reveal>

          <Reveal>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-5">
              <MagneticButton
                to="/"
                className="inline-flex items-center gap-2 rounded-full bg-accent-500 px-6 py-3 text-sm font-medium text-white shadow-md transition-colors hover:bg-accent-600"
              >
                Back to home
              </MagneticButton>
              <Link
                to="/explore"
                className="text-sm font-medium text-accent-600 underline-offset-4 hover:underline"
              >
                Explore destinations
              </Link>
            </div>
          </Reveal>
        </div>
      </Section>
    </Container>
  )
}
