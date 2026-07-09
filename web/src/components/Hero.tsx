import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { HERO_SLIDES, type HeroSlide } from '../assets/hero'
import { fetchCuratedDestinations } from '../api/client'
import { DESTINATIONS } from './explore/destinations'
import { Button, Container, Reveal, usePrefersReducedMotion } from './ui'

// "Quiet luxury" motion: slow, eased, no bounce. The cubic-bezier mirrors the
// --ease-lux token (index.css); framer needs the array form, not the CSS var.
const EASE_LUX = [0.22, 1, 0.36, 1] as const
const SLIDE_MS = 9000 // time each slide is held before advancing
const FADE_S = 1.5 // cross-fade length
const ZOOM_MAX = 1.1 // modest — sources are ~1920px, keep them crisp
const PAN_PX = 26 // gentle Ken Burns drift

// Pan bias: the subject side drifts toward center as the frame zooms.
const PAN: Record<NonNullable<HeroSlide['focus']>, number> = {
  left: PAN_PX,
  center: 0,
  right: -PAN_PX,
}

interface KenBurnsImageProps {
  slide: HeroSlide
  active: boolean
  reduced: boolean
  /** When set, the image is clipped to the subject and layered over the text. */
  clip?: string
  /** When true, the image is treated as the LCP candidate (eager load, high fetch priority). */
  priority?: boolean
}

/**
 * One full-bleed photo layer. Cross-fades on `active` and, while active, slowly
 * zooms + pans (Ken Burns). The masked over-text copy reuses this with the same
 * `active` and motion params so it stays pixel-aligned with the background.
 */
function KenBurnsImage({ slide, active, reduced, clip, priority = false }: KenBurnsImageProps) {
  const pan = PAN[slide.focus ?? 'center']
  const clipStyle = clip ? { clipPath: clip, WebkitClipPath: clip } : undefined
  // Masked copies are always decorative; inactive slides are invisible
  // (opacity 0) but still mounted for preloading, so hide them from AT too.
  const hidden = Boolean(clip) || !active

  if (reduced) {
    // Still frame — no fade, no zoom. Only the first slide is rendered.
    return (
      <img
        src={slide.src}
        alt={hidden ? '' : slide.alt}
        aria-hidden={hidden ? true : undefined}
        fetchPriority={priority ? 'high' : 'low'}
        loading={priority ? 'eager' : 'lazy'}
        className="absolute inset-0 h-full w-full object-cover"
        style={clipStyle}
      />
    )
  }

  return (
    <motion.img
      src={slide.src}
      alt={hidden ? '' : slide.alt}
      aria-hidden={hidden ? true : undefined}
      fetchPriority={priority ? 'high' : 'low'}
      loading={priority ? 'eager' : 'lazy'}
      className="absolute inset-0 h-full w-full object-cover will-change-transform"
      style={clipStyle}
      initial={false}
      animate={
        active
          ? { opacity: 1, scale: ZOOM_MAX, x: pan }
          : { opacity: 0, scale: 1, x: 0 }
      }
      transition={{
        opacity: { duration: FADE_S, ease: EASE_LUX },
        // Steady, continuous zoom across the whole hold; the reset (inactive)
        // happens at opacity 0, so it's never seen.
        scale: { duration: SLIDE_MS / 1000, ease: 'linear' },
        x: { duration: SLIDE_MS / 1000, ease: 'linear' },
      }}
    />
  )
}

/**
 * The hero showpiece: a full-bleed Ken Burns cross-fade slideshow behind a
 * near-white serif headline. Slides with a strong vertical subject render a
 * second, clipped copy layered ABOVE the headline (lg+ only) so the peak /
 * spire / tower appears to rise in front of the type. A dark→transparent
 * scrim keeps every glyph crisp; under reduced-motion it's a single still.
 */
export default function Hero() {
  const reduced = usePrefersReducedMotion()
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  // True while the "Surprise me" lookup is in flight; disables the button and
  // swaps its label for a spinner so a slow network can't fire a second pick.
  const [surprising, setSurprising] = useState(false)

  useEffect(() => {
    if (reduced) return
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % HERO_SLIDES.length),
      SLIDE_MS,
    )
    return () => window.clearInterval(id)
  }, [reduced])

  /**
   * Pick a destination at random and jump straight into planning it. We prefer
   * the live curated atlas (so the surprise tracks the real Explore catalog),
   * but the gallery's bundled DESTINATIONS array is always a valid fallback —
   * so an offline endpoint or an empty payload never leaves the button inert.
   * Picks a name by a plain runtime index so behavior stays deterministic to a
   * mocked catalog in tests; no animation here, hence no reduced-motion gate.
   */
  async function surpriseMe() {
    if (surprising) return
    setSurprising(true)
    let names: string[] = []
    try {
      const curated = await fetchCuratedDestinations()
      names = curated.map((d) => d.name)
    } catch {
      // Endpoint down/network error — fall through to the static atlas below.
    }
    if (names.length === 0) names = DESTINATIONS.map((d) => d.name)
    const name = names[Math.floor(Math.random() * names.length)]
    setSurprising(false)
    navigate(`/plan/${encodeURIComponent(name)}`)
  }

  // Reduced motion shows only the first slide; everything else stacks live.
  const slides = reduced ? HERO_SLIDES.slice(0, 1) : HERO_SLIDES
  const current = slides[reduced ? 0 : index]

  return (
    <section className="relative flex min-h-[88vh] max-h-[940px] items-center overflow-hidden bg-ink">
      {/* Photo layers — all mounted so the browser preloads them; fades never flash. */}
      <div className="absolute inset-0">
        {slides.map((slide, i) => (
          <KenBurnsImage
            key={slide.src}
            slide={slide}
            active={reduced || i === index}
            reduced={reduced}
            priority={i === 0}
          />
        ))}
      </div>

      {/* Scrim. Two layers keep the left-aligned headline crisp on EVERY photo,
          even pale skies (Taj) and tall mobile crops, without dimming the
          masked subjects — those render above this, at z-30.
          • left→right: anchors darkness under the text, clears the right side
            where the peak / tower rises.
          • bottom→up: seats the hero and fades into the warm canvas below. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink/80 via-ink/45 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-canvas via-ink/20 to-transparent" />
      {/* Mobile floor: no masked subject exists below lg, and the text spans the
          full width, so an even wash lifts contrast over bright mid-frames
          (e.g. the snow behind the subhead) without dimming any subject. */}
      <div className="pointer-events-none absolute inset-0 bg-ink/30 lg:hidden" />

      {/* Headline + CTAs. */}
      <Container className="relative z-20">
        <div className="max-w-2xl">
          <Reveal>
            <p className="mb-5 text-sm font-medium uppercase tracking-[0.2em] text-white/70">
              Travel planning, considered
            </p>
          </Reveal>
          <Reveal index={1}>
            <h1 className="text-balance font-serif text-5xl font-medium leading-[1.02] tracking-tightish text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.45)] sm:text-7xl">
              Trips that begin with what you love.
            </h1>
          </Reveal>
          <Reveal index={2}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/85 drop-shadow-[0_1px_12px_rgba(0,0,0,0.5)]">
              Travel AI turns your interests into a destination worth the flight
              — then into an honest, day-by-day plan you can actually follow.
            </p>
          </Reveal>
          <Reveal index={3}>
            <div className="mt-9 flex flex-wrap items-center gap-5">
              <Button to="/discover" size="lg">
                Start discovering →
              </Button>
              {/* Quiet secondary: the bordered variant keeps the one-accent
                  rule intact (no second loud accent button). Plain <button>,
                  no animation of its own — so no reduced-motion concern. */}
              <Button
                variant="secondary"
                size="lg"
                onClick={surpriseMe}
                disabled={surprising}
                aria-busy={surprising}
              >
                {surprising ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin rounded-full border-2 border-ink-line border-t-transparent motion-reduce:animate-none"
                    />
                    Finding…
                  </>
                ) : (
                  'Surprise me →'
                )}
              </Button>
              <Link
                to="/how-it-works"
                className="text-sm font-medium text-white/80 underline-offset-4 transition-colors duration-hover hover:text-white hover:underline"
              >
                How it works
              </Link>
            </div>
          </Reveal>
        </div>
      </Container>

      {/* Signature effect: a clipped copy of the subject, layered OVER the text
          so the peak / spire / tower rises in front of the headline. Desktop
          (lg+) only — the clip-paths are tuned to the wide object-cover crop;
          on narrow screens the crop shifts, so we fall back to scrim-only. */}
      {!reduced && (
        <div
          className="pointer-events-none absolute inset-0 z-30 hidden lg:block"
          aria-hidden="true"
        >
          {slides.map((slide, i) =>
            slide.subjectMask ? (
              <KenBurnsImage
                key={`mask-${slide.src}`}
                slide={slide}
                active={i === index}
                reduced={false}
                clip={slide.subjectMask}
              />
            ) : null,
          )}
        </div>
      )}

      {/* Current-location credit, lower-right — quiet, optional. */}
      {current?.credit && (
        <span className="pointer-events-none absolute bottom-5 right-6 z-20 text-xs font-medium tracking-wide text-white/55">
          {current.credit}
        </span>
      )}
    </section>
  )
}
