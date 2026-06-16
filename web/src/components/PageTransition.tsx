import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { usePrefersReducedMotion } from './ui/usePrefersReducedMotion'
import { durationSeconds, easeLux } from './ui/motionTokens'

/**
 * Wraps the app's <Routes> (placed by Terminal 0) so route changes cross-fade
 * — opacity + a small upward rise — over the shared `--dur-route` token with
 * `--ease-lux`. Keyed on the pathname so AnimatePresence sees each route as a
 * distinct child and runs exit→enter. Under reduced-motion it renders children
 * directly with no animation. Default-export `({ children }) => ReactNode`
 * contract preserved from the stub.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const reduced = usePrefersReducedMotion()
  const location = useLocation()

  if (reduced) {
    return <>{children}</>
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: durationSeconds('route'), ease: easeLux() }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
