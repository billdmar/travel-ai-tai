import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import type { ReactNode } from 'react'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

interface ParallaxLayerProps {
  children: ReactNode
  className?: string
  /**
   * Parallax depth. Positive = element drifts slower than scroll (recedes);
   * larger magnitude = stronger effect. ~0.15–0.4 reads as elegant, not gimmicky.
   */
  speed?: number
}

/**
 * Wraps content in a layer that drifts vertically as the page scrolls past it,
 * creating depth. Under reduced-motion it is a static <div> — no transform,
 * no scroll listener.
 */
export function ParallaxLayer({
  children,
  className = '',
  speed = 0.25,
}: ParallaxLayerProps) {
  const reduced = usePrefersReducedMotion()
  const ref = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })
  // Map 0→1 progress to a px offset; the layer moves opposite to scroll.
  const range = 120 * speed
  const y = useTransform(scrollYProgress, [0, 1], [range, -range])

  if (reduced) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  )
}
