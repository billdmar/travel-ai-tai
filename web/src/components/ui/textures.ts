/**
 * Tasteful, self-contained surface treatments for the quiet-luxury aesthetic:
 * a faint film grain, soft warm radial glows, and a frosted-blur overlay. These
 * are exported as Tailwind class strings + inline-style fragments so pages can
 * opt in without touching the shared index.css / tailwind.config (single-owner
 * rule). Everything here is purely decorative and `aria-hidden`-friendly.
 */
import type { CSSProperties } from 'react'

/**
 * An SVG fractal-noise data URI — a barely-there film grain. Layer it as a
 * `::before`-style absolute overlay (very low opacity) for warmth on flat
 * ivory bands. No external request; inlined and cached by the browser.
 */
const GRAIN_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E"

/** Inline style for a faint grain overlay element (set the element to absolute, inset-0). */
export const grainOverlayStyle: CSSProperties = {
  backgroundImage: `url("${GRAIN_SVG}")`,
  // Multiply keeps the grain reading as texture over warm tones, not haze.
  mixBlendMode: 'multiply',
  opacity: 0.04,
  pointerEvents: 'none',
}

/**
 * A soft warm radial wash anchored to a corner — adds depth behind hero/CTA
 * bands without a hard gradient seam. Pass a `from` color (accent/ivory tints).
 */
export function softGlow(
  position: 'top-left' | 'top-right' | 'bottom' = 'top-right',
  color = 'rgba(63,122,114,0.10)', // accent-500 @ 10%
): CSSProperties {
  const at =
    position === 'top-left'
      ? '15% 10%'
      : position === 'bottom'
        ? '50% 110%'
        : '85% 10%'
  return {
    backgroundImage: `radial-gradient(60rem 40rem at ${at}, ${color}, transparent 70%)`,
    pointerEvents: 'none',
  }
}

/** A frosted-glass panel treatment for floating bars / sticky chrome. */
export const frostedPanel =
  'bg-canvas-raised/70 backdrop-blur-md backdrop-saturate-150 supports-[backdrop-filter]:bg-canvas-raised/55'

/**
 * Variable-font expressiveness for Cormorant Garamond headlines: a wider
 * optical weight axis play. Returns inline style so a single headline can lean
 * into the variable axis without a global font rule. Keep weights tasteful
 * (400–600) so it stays "quiet luxury", never shouty.
 */
export function variableSerif(weight = 500): CSSProperties {
  return {
    fontVariationSettings: `"wght" ${weight}`,
    fontFeatureSettings: '"liga" 1, "dlig" 1, "swsh" 1',
  }
}
