import type { ElementType, ReactNode } from 'react'

interface SectionProps {
  children: ReactNode
  className?: string
  /** Vertical rhythm. `spacious` for landing bands, `cozy` for forms. */
  size?: 'cozy' | 'default' | 'spacious'
  as?: ElementType
  id?: string
}

const PADDING: Record<NonNullable<SectionProps['size']>, string> = {
  cozy: 'py-10 sm:py-14',
  default: 'py-16 sm:py-24',
  spacious: 'py-24 sm:py-36',
}

/**
 * A vertical band of the page. Owns generous whitespace so individual pages
 * stay free of ad-hoc padding values.
 */
export function Section({
  children,
  className = '',
  size = 'default',
  as: Tag = 'section',
  id,
}: SectionProps) {
  return (
    <Tag id={id} className={`${PADDING[size]} ${className}`}>
      {children}
    </Tag>
  )
}
