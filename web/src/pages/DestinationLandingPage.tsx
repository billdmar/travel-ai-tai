import { useParams } from 'react-router-dom'
import { Container, Section } from '../components/ui'

/**
 * Per-destination landing page (FOUNDATION stub at /destination/:slug).
 *
 * FE-NEW fills this in with destination details, gallery, and a quick-plan CTA.
 */
export default function DestinationLandingPage() {
  const { slug } = useParams<{ slug: string }>()
  return (
    <Container>
      <Section>
        <h1 className="font-serif text-5xl font-medium leading-[1.08] tracking-tight text-ink sm:text-6xl">
          {slug ?? 'Destination'}
        </h1>
      </Section>
    </Container>
  )
}
