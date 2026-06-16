import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'
import { durationSeconds, easeLux } from './motionTokens'

interface RevealProps {
  children: ReactNode
  className?: string
  /** Stagger index — multiplies the base delay for sequenced cards. */
  index?: number
  /** Travel distance in px for the upward fade. */
  y?: number
  as?: 'div' | 'li' | 'section' | 'article'
}

const BASE_DELAY = 0.06

/**
 * Scroll-reveal: fades + lifts its children into view once, the first time
 * they enter the viewport. Under reduced-motion it renders a plain element
 * with no transform and no animation.
 */
export function Reveal({
  children,
  className = '',
  index = 0,
  y = 12,
  as = 'div',
}: RevealProps) {
  const reduced = usePrefersReducedMotion()

  if (reduced) {
    const Tag = as
    return <Tag className={className}>{children}</Tag>
  }

  const MotionTag = motion[as]
  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{
        duration: durationSeconds('reveal'),
        delay: index * BASE_DELAY,
        ease: easeLux(),
      }}
    >
      {children}
    </MotionTag>
  )
}
