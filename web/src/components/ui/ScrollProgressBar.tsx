import { motion, useScroll, useSpring } from 'framer-motion'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

interface ScrollProgressBarProps {
  className?: string
}

/**
 * A hairline accent bar pinned to the top of a scroll region that fills as the
 * page scrolls — a quiet wayfinding cue for long pages. Spring-smoothed so it
 * glides rather than tracks 1:1. Under reduced-motion it renders nothing (the
 * cue is decorative and the smooth fill would violate the motion preference).
 */
export function ScrollProgressBar({ className = '' }: ScrollProgressBarProps) {
  const reduced = usePrefersReducedMotion()
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 30,
    mass: 0.4,
  })

  if (reduced) return null

  return (
    <motion.div
      aria-hidden
      style={{ scaleX, transformOrigin: 'left' }}
      className={`fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-accent-500/80 ${className}`}
    />
  )
}
