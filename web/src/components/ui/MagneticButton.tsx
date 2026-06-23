import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { useRef } from 'react'
import type { PointerEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

interface MagneticButtonProps {
  children: ReactNode
  className?: string
  /** Internal link target — renders a react-router <Link>. */
  to?: string
  /** Click handler — renders a native <button>. */
  onClick?: () => void
  type?: 'button' | 'submit'
  'aria-label'?: string
  /**
   * Pull strength. The element drifts up to `strength` px toward the cursor
   * while hovered, settling back on leave. ~0.2–0.4 reads as a gentle pull.
   */
  strength?: number
}

/**
 * A wrapper that gives its child a subtle "magnetic" pull toward the pointer —
 * the element eases a few px toward the cursor on hover and springs back on
 * leave, all over the shared quiet-luxury easing (a critically-damped spring,
 * NO overshoot/bounce). Under reduced-motion it renders a plain, static element
 * with no pointer tracking. Purely presentational; data flow is untouched.
 */
export function MagneticButton({
  children,
  className = '',
  to,
  onClick,
  type = 'button',
  strength = 0.3,
  ...rest
}: MagneticButtonProps) {
  const reduced = usePrefersReducedMotion()
  const ref = useRef<HTMLDivElement>(null)

  const mvX = useMotionValue(0)
  const mvY = useMotionValue(0)
  // Critically-damped spring: settles smoothly, never overshoots (no bounce).
  const spring = { stiffness: 150, damping: 22, mass: 0.6 }
  const x = useSpring(mvX, spring)
  const y = useSpring(mvY, spring)
  // A whisper of counter-scale so the pull feels intentional, not jittery.
  const scale = useTransform([x, y], ([dx, dy]: number[]) => {
    const d = Math.hypot(dx, dy)
    return 1 + Math.min(d / 600, 0.02)
  })

  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    mvX.set((e.clientX - cx) * strength)
    mvY.set((e.clientY - cy) * strength)
  }

  const reset = () => {
    mvX.set(0)
    mvY.set(0)
  }

  const ariaLabel = rest['aria-label']

  const inner =
    to !== undefined ? (
      <Link to={to} className={className} aria-label={ariaLabel}>
        {children}
      </Link>
    ) : (
      <button
        type={type}
        onClick={onClick}
        className={className}
        aria-label={ariaLabel}
      >
        {children}
      </button>
    )

  if (reduced) {
    return <div className="inline-block">{inner}</div>
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      style={{ x, y, scale }}
      className="inline-block"
    >
      {inner}
    </motion.div>
  )
}
