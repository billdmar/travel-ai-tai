import { motion, useScroll, useSpring, useTransform } from 'framer-motion'
import { useRef } from 'react'
import type { ReactNode } from 'react'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

interface ScrollScaleProps {
  children: ReactNode
  className?: string
  /**
   * How far below 1 the element starts as it enters the viewport. 0.04 = it
   * begins at 96% and settles to 100% — a subtle "shared element" swell.
   */
  amount?: number
  /** Also lift opacity from this floor as the element scales in. */
  fade?: boolean
}

/**
 * Scroll-driven scale (and optional fade): the element eases from a hair
 * smaller / dimmer to full size as it scrolls through the lower half of the
 * viewport, giving framed media a quiet "settling into place" feel. A spring
 * smooths the scroll mapping so it never snaps. Reduced-motion → static <div>.
 * Presentation only — does not touch children's data or layout box.
 */
export function ScrollScale({
  children,
  className = '',
  amount = 0.04,
  fade = false,
}: ScrollScaleProps) {
  const reduced = usePrefersReducedMotion()
  const ref = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'center center'],
  })
  const smooth = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 26,
    mass: 0.5,
  })
  const scale = useTransform(smooth, [0, 1], [1 - amount, 1])
  const opacity = useTransform(smooth, [0, 1], [fade ? 0.5 : 1, 1])

  if (reduced) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      ref={ref}
      style={{ scale, opacity, transformOrigin: 'center bottom' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
