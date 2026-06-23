import type { Vibe } from './destinations'

interface VibeFilterProps {
  vibes: Vibe[]
  /** Currently active vibe, or null for "All". */
  active: Vibe | null
  onChange: (vibe: Vibe | null) => void
}

const CHIP_BASE =
  'rounded-full border px-4 py-1.5 text-sm font-medium tracking-tightish transition-[color,background-color,border-color] duration-hover ease-lux outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'
const CHIP_ON = 'border-accent-500 bg-accent-500 text-white'
const CHIP_OFF =
  'border-ink-line bg-canvas-raised text-ink-soft hover:border-accent-300 hover:text-ink'

/**
 * Pill toggle row for filtering the Explore gallery by vibe. Single-select with
 * an "All" reset. Uses aria-pressed to mirror the toggle pattern already used
 * elsewhere in the app.
 */
export function VibeFilter({ vibes, active, onChange }: VibeFilterProps) {
  return (
    <div
      role="group"
      aria-label="Filter destinations by vibe"
      className="flex flex-wrap gap-2.5"
    >
      <button
        type="button"
        aria-pressed={active === null}
        onClick={() => onChange(null)}
        className={`${CHIP_BASE} ${active === null ? CHIP_ON : CHIP_OFF}`}
      >
        All
      </button>
      {vibes.map((vibe) => {
        const on = active === vibe
        return (
          <button
            key={vibe}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : vibe)}
            className={`${CHIP_BASE} ${on ? CHIP_ON : CHIP_OFF}`}
          >
            {vibe}
          </button>
        )
      })}
    </div>
  )
}
