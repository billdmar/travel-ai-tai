/**
 * Bridges the shared "quiet luxury" motion tokens (defined as CSS custom
 * properties in index.css and mirrored into the Tailwind theme) into the
 * numeric forms framer-motion needs. JS-driven animations and CSS-driven ones
 * thus read from ONE source of truth — no hard-coded magic durations or curves.
 *
 * Values are read from :root at call time (client-only) and memoized. When the
 * DOM is unavailable (SSR / tests) or a var is missing, we fall back to the
 * documented token defaults so callers always get a usable value.
 */

type DurationToken = 'reveal' | 'route' | 'hover'

// Mirrors index.css :root — only used when the live CSS var can't be read.
const DURATION_FALLBACK_S: Record<DurationToken, number> = {
  reveal: 0.6,
  route: 0.5,
  hover: 0.24,
}
const EASE_LUX_FALLBACK: [number, number, number, number] = [0.22, 1, 0.36, 1]

const durationCache: Partial<Record<DurationToken, number>> = {}
let easeCache: [number, number, number, number] | null = null

function rootStyle(): CSSStyleDeclaration | null {
  if (typeof window === 'undefined' || !window.getComputedStyle) return null
  return window.getComputedStyle(document.documentElement)
}

/** Duration of a shared `--dur-*` token, in seconds (framer-motion units). */
export function durationSeconds(token: DurationToken): number {
  const cached = durationCache[token]
  if (cached !== undefined) return cached

  const raw = rootStyle()?.getPropertyValue(`--dur-${token}`).trim()
  let value = DURATION_FALLBACK_S[token]
  if (raw) {
    const n = parseFloat(raw)
    // Tokens are authored in ms ("600ms"); also tolerate a bare "s" unit.
    if (!Number.isNaN(n)) value = raw.endsWith('ms') ? n / 1000 : n
  }

  durationCache[token] = value
  return value
}

/** The shared `--ease-lux` cubic-bezier as a framer-motion easing tuple. */
export function easeLux(): [number, number, number, number] {
  if (easeCache) return easeCache

  const raw = rootStyle()?.getPropertyValue('--ease-lux').trim()
  const match = raw?.match(/cubic-bezier\(([^)]+)\)/)
  let value = EASE_LUX_FALLBACK
  if (match) {
    const parts = match[1].split(',').map((p) => parseFloat(p.trim()))
    if (parts.length === 4 && !parts.some(Number.isNaN)) {
      value = parts as [number, number, number, number]
    }
  }

  easeCache = value
  return value
}
