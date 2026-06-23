import { Link } from 'react-router-dom'
import { DestinationImage } from '../DestinationImage'
import { Reveal } from '../ui'
import type { CuratedDestination } from './destinations'

interface DestinationCardProps {
  destination: CuratedDestination
  /** Stagger index for the scroll-reveal sequence. */
  index?: number
}

/**
 * A framed photography card for the Explore gallery. The whole card is a link
 * to the destination's immersive landing page (/destination/:slug). Reuses the
 * shared DestinationImage (live photo + bundled fallback) and Reveal stagger;
 * the slow image zoom is motion-safe only.
 */
export function DestinationCard({ destination, index = 0 }: DestinationCardProps) {
  const { slug, name, country, query, tagline, vibes } = destination

  return (
    <Reveal as="article" index={index} className="h-full">
      <Link
        to={`/destination/${slug}`}
        className="group block h-full rounded-2xl outline-none transition-shadow duration-hover ease-lux focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        aria-label={`Explore ${name}, ${country}`}
      >
        <div className="relative overflow-hidden rounded-2xl">
          <DestinationImage
            query={query}
            alt={`${name}, ${country}`}
            aspect="aspect-[4/5]"
            showCredit={false}
            className="motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-lux motion-safe:group-hover:scale-[1.04]"
          />
          {/* Gradient scrim so the overlaid label stays legible on any photo. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-t from-ink/70 via-ink/10 to-transparent"
          />
          <div className="absolute inset-x-0 bottom-0 p-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-canvas/80">
              {vibes[0]}
            </p>
            <h3 className="mt-1 font-serif text-2xl font-medium leading-tight text-canvas">
              {name}
            </h3>
            <p className="mt-0.5 text-sm text-canvas/85">{country}</p>
            <p className="mt-2 line-clamp-2 text-sm leading-snug text-canvas/75">
              {tagline}
            </p>
          </div>
        </div>
      </Link>
    </Reveal>
  )
}
