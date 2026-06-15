import type { ReactNode } from 'react'

interface ContainerProps {
  children: ReactNode
  className?: string
  /** Narrower measure for prose-heavy content. */
  narrow?: boolean
}

/**
 * Centered, padded content column. The single source of horizontal rhythm —
 * pages compose <Section><Container>… rather than re-deriving max-widths.
 */
export function Container({ children, className = '', narrow = false }: ContainerProps) {
  const width = narrow ? 'max-w-3xl' : 'max-w-container'
  return (
    <div className={`mx-auto w-full ${width} px-6 sm:px-8 ${className}`}>{children}</div>
  )
}
