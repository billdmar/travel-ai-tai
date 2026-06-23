import { useParams } from 'react-router-dom'
import { Container, Section } from '../components/ui'

/**
 * Public read-only shared itinerary page (FOUNDATION stub at /share/:token).
 *
 * No save/delete affordances — read-only. FE-FEATURES fills this in to load the
 * shared itinerary via getSharedItinerary(token).
 */
export default function SharePage() {
  const { token } = useParams<{ token: string }>()
  return (
    <Container>
      <Section>
        <h1 className="font-serif text-5xl font-medium leading-[1.08] tracking-tight text-ink sm:text-6xl">
          Shared itinerary
        </h1>
        <p className="mt-4 text-ink-faint">{token}</p>
      </Section>
    </Container>
  )
}
