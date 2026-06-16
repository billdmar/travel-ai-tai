// Hero slideshow manifest — the photos and per-slide art direction that drive
// the Ken Burns cross-fade in <Hero/>. Each .webp here was optimized from a
// free-license landmark photo (~1920px long edge, webp q≈54–80, all <300KB).
//
// `subjectMask` is a CSS clip-path value (in the layer's own box coordinates)
// that isolates a strong vertical subject — the peak, the spire, the towers —
// so a second copy of the photo can be layered ABOVE the headline and the
// subject appears to rise IN FRONT of the type. Because the photos are 3:2 and
// the hero uses object-cover, the crop differs sharply by viewport; the masked
// overlay is therefore a DESKTOP-ONLY (lg+) flourish, tuned to the wide crop,
// and we fall back to scrim-only on narrow screens and for any slide whose
// subject can't cross the headline without obscuring a glyph.
import amaDablam from './ama-dablam.webp'
import eiffelTower from './eiffel-tower.webp'
import towerBridge from './tower-bridge.webp'
import himejiCastle from './himeji-castle.webp'
import tajMahal from './taj-mahal.webp'
import beachSunset from './beach-sunset.webp'
import treviFountain from './trevi-fountain.webp'

export interface HeroSlide {
  src: string
  alt: string
  /** CSS clip-path isolating the subject for the masked over-text overlay. */
  subjectMask?: string
  /** Ken Burns pan bias — which side the subject sits on. */
  focus?: 'left' | 'center' | 'right'
  credit?: string
}

// Order opens on the dramatic peak, varies the masked column left↔center↔right
// across frames, rests on the beach, and closes on the (unmasked) night Trevi.
export const HERO_SLIDES: HeroSlide[] = [
  {
    src: amaDablam,
    alt: 'The snow-capped summit of Ama Dablam rising against a deep blue Himalayan sky.',
    // Triangular peak, apex center-right against open sky — clips cleanly.
    subjectMask: 'polygon(60% 62%, 74% 6%, 95% 62%)',
    focus: 'right',
    credit: 'Ama Dablam, Nepal',
  },
  {
    src: eiffelTower,
    alt: 'The Eiffel Tower at golden hour, framed by wide open sky.',
    // Spire is dead-center, directly over the left-aligned headline — there is
    // no safe outer-edge gap, so masking would clip identifying strokes of
    // "love." Per the legibility rule we fall back to scrim-only here.
    focus: 'center',
    credit: 'Eiffel Tower, Paris',
  },
  {
    src: tajMahal,
    alt: 'The Taj Mahal and its central dome under a calm, pale sky.',
    focus: 'center',
    credit: 'Taj Mahal, Agra',
  },
  {
    src: himejiCastle,
    alt: 'Himeji Castle framed by cherry blossoms in spring.',
    focus: 'left',
    credit: 'Himeji Castle, Japan',
  },
  {
    src: towerBridge,
    alt: 'Tower Bridge over the Thames beneath a moody evening sky.',
    // The RIGHT tower — sits past the left-aligned headline so it rises in
    // front of the open right side, never crossing a glyph (the left tower
    // would have covered the headline core).
    subjectMask: 'polygon(55% 80%, 55% 20%, 73% 20%, 73% 80%)',
    focus: 'right',
    credit: 'Tower Bridge, London',
  },
  {
    src: beachSunset,
    alt: 'A quiet beach at sunset — warm light over calm water.',
    // Ambient "rest" frame — no vertical subject, scrim only.
    focus: 'center',
    credit: 'Coastal sunset',
  },
  {
    src: treviFountain,
    alt: 'The Trevi Fountain illuminated at night.',
    // Busy, fills the frame, no negative space — scrim only, placed last.
    focus: 'center',
    credit: 'Trevi Fountain, Rome',
  },
]
