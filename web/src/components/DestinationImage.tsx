import { useEffect, useState } from 'react'
import { fetchImage } from '../api/client'
import type { ImageResult } from '../types/discovery'
import { matchDestinationAsset } from '../assets/destinations'

interface DestinationImageProps {
  /** Query for the live image service (destination name or image_query). */
  query: string
  /** Accessible alt text; falls back to the query. */
  alt?: string
  className?: string
  /** Aspect ratio utility (Tailwind), e.g. 'aspect-[4/3]'. */
  aspect?: string
  /** Show the Unsplash photographer credit overlay when present. */
  showCredit?: boolean
  /** Eager-load (above the fold) instead of lazy. */
  eager?: boolean
}

/**
 * Framed destination photo. Resolves a live image from GET /api/v1/images and,
 * on fallback/null/error, renders a bundled .webp so a card never shows a
 * broken image. Lazy-loaded by default; credits the photographer when the live
 * service provides attribution (Unsplash API guideline).
 */
export function DestinationImage({
  query,
  alt,
  className = '',
  aspect = 'aspect-[4/3]',
  showCredit = true,
  eager = false,
}: DestinationImageProps) {
  const bundled = matchDestinationAsset(query)
  // Tag the resolved result with the query it belongs to, so a stale response
  // for a previous query is ignored without a synchronous reset-in-effect.
  const [resolved, setResolved] = useState<{ q: string; data: ImageResult } | null>(null)
  // Track the specific URL that failed to load, rather than a boolean flag.
  const [erroredUrl, setErroredUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchImage(query).then((data) => {
      if (active) setResolved({ q: query, data })
    })
    return () => {
      active = false
    }
  }, [query])

  const result = resolved?.q === query ? resolved.data : null

  // Use the live URL only if the service succeeded and the <img> itself loaded.
  const liveUrl =
    result && !result.fallback && result.url && result.url !== erroredUrl
      ? result.url
      : null
  const src = liveUrl ?? bundled
  const credit = liveUrl ? result?.credit : null
  const label = alt ?? result?.alt ?? query

  return (
    <figure
      className={`relative overflow-hidden rounded-2xl bg-canvas-sunken shadow-frame ring-1 ring-ink-line ${aspect} ${className}`}
    >
      <img
        src={src}
        alt={label}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => setErroredUrl(src)}
        className="h-full w-full object-cover"
      />
      {showCredit && credit ? (
        <figcaption className="absolute bottom-0 right-0 m-2 rounded-md bg-ink/55 px-2 py-1 text-[11px] leading-none text-canvas backdrop-blur-sm">
          Photo:{' '}
          <a
            href={credit.link}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-canvas/40 underline-offset-2 hover:decoration-canvas"
          >
            {credit.name}
          </a>
        </figcaption>
      ) : null}
    </figure>
  )
}
