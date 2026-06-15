import { Container, Section, Reveal } from '../components/ui'

interface Faq {
  q: string
  a: string
}

const FAQS: Faq[] = [
  {
    q: 'How are recommendations generated?',
    a: 'Destinations and itineraries are produced by large language models guided by the hobbies, dates, pace, and budget you provide. They are suggestions to start from — verify hours, prices, and availability before you book.',
  },
  {
    q: 'Where do the images come from?',
    a: 'Destination and activity imagery is sourced from Unsplash and used under the Unsplash License. Rights remain with the original photographers.',
  },
  {
    q: 'Are the booking links affiliate links?',
    a: 'Some are. When you book through one of those links, we may earn a commission. It never changes the price you pay, and it does not influence which places we recommend.',
  },
  {
    q: 'What about my privacy?',
    a: 'We store the itineraries you choose to save so you can return to them. We do not sell your personal information. Cost estimates and map links are generated server-side from your preferences.',
  },
]

export default function DisclosurePage() {
  return (
    <Container>
      <Section>
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <header>
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-brand-600">
                Disclosure
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">
                Affiliate disclosure
              </h1>
            </header>
          </Reveal>

          <Reveal>
            <div className="mt-8 space-y-5 leading-relaxed text-slate-600">
              <p>
                In accordance with the U.S. Federal Trade Commission’s (FTC) guidelines on
                endorsements and testimonials, Travel AI wants to be transparent about how we may be
                compensated.
              </p>
              <p>
                Some of the links in our itineraries — particularly “Book” links for activities,
                accommodations, and experiences — are affiliate links. This means that if you click
                one of these links and make a purchase or booking, we may receive a commission from
                the provider, <strong className="font-medium text-slate-800">at no additional
                cost to you</strong>.
              </p>
              <p>
                We only ever earn a commission when you complete a booking through an affiliate
                link. The presence of an affiliate relationship does not influence which
                destinations or activities we recommend — those are generated from your stated
                interests and preferences. Recommendations without affiliate links are shown on
                exactly the same terms as those with them.
              </p>
              <p>
                Prices, availability, and details shown in an itinerary are estimates and may differ
                from what you see at the time of booking. Always confirm the final terms with the
                provider before purchasing.
              </p>
            </div>
          </Reveal>

          <Reveal>
            <section className="mt-12">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                Frequently asked
              </h2>
              <dl className="mt-4 space-y-4">
                {FAQS.map((faq) => (
                  <div
                    key={faq.q}
                    className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6"
                  >
                    <dt className="font-semibold text-slate-900">{faq.q}</dt>
                    <dd className="mt-1.5 leading-relaxed text-slate-500">{faq.a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </Reveal>

          <Reveal>
            <p className="mt-10 text-sm text-slate-400">
              Questions about this disclosure? Reach out through the contact options on our About
              page.
            </p>
          </Reveal>
        </div>
      </Section>
    </Container>
  )
}
