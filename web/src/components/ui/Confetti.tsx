import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'
import { durationSeconds, easeLux } from './motionTokens'

interface ConfettiProps {
  /**
   * Called once the burst has finished animating (the last particle's
   * `onAnimationComplete`). The parent typically uses this to unmount us and
   * clear its `celebrate` flag.
   */
  onDone?: () => void
  /** Particle count — 14 reads as a celebration without confetti soup. */
  count?: number
}

// Restrained palette: warm accent tones + ink, in keeping with the quiet-luxury
// system. NO loud primary rainbow — confetti, but tasteful. The hex literals
// mirror the Tailwind `accent`/`ink` tokens (tailwind.config.js); they're used
// as raw fills here because particles are inline-styled motion.div squares
// rather than Tailwind-classed elements.
const PARTICLE_COLORS = [
  '#3f7a72', // accent-500 (primary)
  '#5a938b', // accent-400
  '#82b0a9', // accent-300
  '#2b2a28', // ink
]

interface Particle {
  /** Final x offset from the center origin, in px. */
  x: number
  /** Final y offset from the center origin, in px (negative = upward). */
  y: number
  color: string
  size: number
  rotate: number
}

/**
 * A no-dependency confetti burst: a handful of small squares spray outward from
 * the viewport center on mount, fading and shrinking as they settle. Built from
 * plain `motion.div`s (framer-motion is already in the bundle) — no
 * canvas-confetti or other runtime dep.
 *
 * Each particle's angle/distance/color/size is derived DETERMINISTICALLY from
 * its index (a trig spread, not `Math.random`) and memoized once, so a parent
 * re-render never re-rolls the burst mid-flight. The container is fixed, full
 * viewport, non-interactive and `aria-hidden` — purely decorative.
 *
 * Under reduced motion this renders nothing (returns null): a celebratory burst
 * has no static equivalent, so the honest fallback is simply no animation.
 */
export function Confetti({ onDone, count = 14 }: ConfettiProps) {
  const reduced = usePrefersReducedMotion()

  // Compute the particle field once. Even though we early-return below under
  // reduced motion, hooks must run unconditionally — and the memo keeps the
  // field stable across the parent's re-renders so the burst never re-rolls.
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: count }, (_, i) => {
      // Even angular spread around the full circle, nudged per-index so columns
      // don't line up; radius alternates to give the burst visual depth.
      const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.4
      const radius = 120 + (i % 4) * 46
      return {
        x: Math.cos(angle) * radius,
        // Bias slightly upward (gravity-defying pop) before the fade-out.
        y: Math.sin(angle) * radius - 40,
        color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
        size: 7 + (i % 3) * 3,
        rotate: (i % 2 === 0 ? 1 : -1) * (90 + (i % 5) * 30),
      }
    })
  }, [count])

  if (reduced) return null

  // The burst rides the shared reveal token, stretched ~1.5x so particles have
  // room to travel and settle gracefully.
  const duration = durationSeconds('reveal') * 1.5

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
    >
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute left-1/2 top-1/2 rounded-[2px]"
          style={{ width: p.size, height: p.size, backgroundColor: p.color }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.4, rotate: p.rotate }}
          transition={{ duration, ease: easeLux() }}
          // Only the last particle reports completion, so `onDone` fires once.
          onAnimationComplete={i === particles.length - 1 ? onDone : undefined}
        />
      ))}
    </div>
  )
}
