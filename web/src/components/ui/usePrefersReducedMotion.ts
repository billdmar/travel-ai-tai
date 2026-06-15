import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Returns `true` when the user has requested reduced motion. Every motion
 * primitive consults this and renders a static, no-animation variant when it
 * is true. SSR/initial value is `false` (motion enabled) but corrected on
 * mount, and we subscribe to live changes to the OS/browser setting.
 */
export function usePrefersReducedMotion(): boolean {
  // Lazy initializer reads the current preference once, synchronously, so the
  // effect only has to subscribe to changes (no setState in the effect body).
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(QUERY).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(QUERY)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return reduced
}
