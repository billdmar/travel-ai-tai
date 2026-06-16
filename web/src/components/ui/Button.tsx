import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

// Gentle "quiet luxury" hover: a 2px lift + soft shadow over the shared
// --dur-hover / --ease-lux tokens. `motion-safe:` (plus the reduced-motion CSS
// backstop) means the lift no-ops when motion is reduced; disabled buttons
// never lift. transition spans color + transform + shadow so all settle as one.
const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-tightish transition-[color,background-color,transform,box-shadow] duration-hover ease-lux motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lift disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent-500 text-white hover:bg-accent-600 active:bg-accent-700',
  secondary:
    'border border-ink-line bg-canvas-raised text-ink hover:bg-canvas-sunken',
  ghost: 'text-accent-600 hover:bg-accent-50',
}

const SIZES: Record<Size, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-2.5 text-sm',
  lg: 'px-8 py-3.5 text-base',
}

interface CommonProps {
  variant?: Variant
  size?: Size
  className?: string
  children: ReactNode
}

type ButtonAsButton = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { to?: undefined; href?: undefined }

type ButtonAsLink = CommonProps & {
  to: string
  href?: undefined
}

type ButtonAsAnchor = CommonProps & {
  href: string
  to?: undefined
}

type ButtonProps = ButtonAsButton | ButtonAsLink | ButtonAsAnchor

/**
 * The one button. Renders as a react-router <Link> (`to`), an external anchor
 * (`href`), or a native <button> otherwise — so call sites stay declarative.
 */
export function Button(props: ButtonProps) {
  const { variant = 'primary', size = 'md', className = '', children } = props
  const cls = `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`

  if ('to' in props && props.to !== undefined) {
    return (
      <Link to={props.to} className={cls}>
        {children}
      </Link>
    )
  }

  if ('href' in props && props.href !== undefined) {
    return (
      <a href={props.href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    )
  }

  // Strip the styling props so only valid <button> attributes are spread.
  const { variant: _variant, size: _size, className: _className, children: _children, ...rest } =
    props
  void _variant
  void _size
  void _className
  void _children
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  )
}
