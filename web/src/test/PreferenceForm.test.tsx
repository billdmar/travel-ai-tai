import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PreferenceForm from '../components/PreferenceForm'
import type { TravelPreferences } from '../types/itinerary'

/**
 * Drive the 4-step wizard to the final "Needs & notes" step. Step 1 requires a
 * destination (dates default to today, which validates), so we fill it and then
 * advance with the Next button three times.
 */
async function gotoNeedsStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText(/Tokyo, Japan/), 'Lisbon')
  await user.click(screen.getByRole('button', { name: 'Next' }))
  await user.click(screen.getByRole('button', { name: 'Next' }))
  await user.click(screen.getByRole('button', { name: 'Next' }))
}

function lastSubmittedPrefs(onSubmit: ReturnType<typeof vi.fn>): TravelPreferences {
  const calls = onSubmit.mock.calls
  return calls[calls.length - 1][0] as TravelPreferences
}

describe('PreferenceForm dietary & accessibility inputs', () => {
  afterEach(() => vi.restoreAllMocks())

  it('submits empty arrays when no needs are selected', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<PreferenceForm onSubmit={onSubmit} />)

    await gotoNeedsStep(user)
    await user.click(screen.getByRole('button', { name: 'Generate itinerary' }))

    const prefs = lastSubmittedPrefs(onSubmit)
    expect(prefs.dietary_needs).toEqual([])
    expect(prefs.accessibility_needs).toEqual([])
  })

  it('includes selected curated options in the submitted payload', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<PreferenceForm onSubmit={onSubmit} />)

    await gotoNeedsStep(user)
    await user.click(screen.getByRole('checkbox', { name: 'Vegan' }))
    await user.click(screen.getByRole('checkbox', { name: 'Wheelchair' }))
    await user.click(screen.getByRole('button', { name: 'Generate itinerary' }))

    const prefs = lastSubmittedPrefs(onSubmit)
    expect(prefs.dietary_needs).toContain('Vegan')
    expect(prefs.accessibility_needs).toContain('Wheelchair')
  })

  it('adds a free-text custom dietary entry and submits it as a chip', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<PreferenceForm onSubmit={onSubmit} />)

    await gotoNeedsStep(user)
    await user.type(screen.getByLabelText('Add a custom dietary need'), 'shellfish allergy')
    // Two "Add" buttons (dietary + accessibility); the first is dietary.
    await user.click(screen.getAllByRole('button', { name: 'Add' })[0])

    // The custom value renders as a removable chip.
    expect(screen.getByText('shellfish allergy')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Remove shellfish allergy' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Generate itinerary' }))
    const prefs = lastSubmittedPrefs(onSubmit)
    expect(prefs.dietary_needs).toContain('shellfish allergy')
  })

  it('removes a custom entry when its chip remove button is clicked', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<PreferenceForm onSubmit={onSubmit} />)

    await gotoNeedsStep(user)
    const input = screen.getByLabelText('Add a custom accessibility need')
    await user.type(input, 'service animal{Enter}')
    expect(screen.getByText('service animal')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove service animal' }))
    expect(screen.queryByText('service animal')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Generate itinerary' }))
    const prefs = lastSubmittedPrefs(onSubmit)
    expect(prefs.accessibility_needs).toEqual([])
  })
})

describe('PreferenceForm slider accessibility', () => {
  afterEach(() => vi.restoreAllMocks())

  it('exposes a human-readable aria-valuetext on the budget slider', async () => {
    const user = userEvent.setup()
    render(<PreferenceForm onSubmit={vi.fn()} />)

    // Advance to step 2 ("Budget & group") where the range inputs live.
    await user.type(screen.getByPlaceholderText(/Tokyo, Japan/), 'Lisbon')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // The slider default is $2,000 — screen readers should hear that, not "2000".
    const budget = screen.getByRole('slider', { name: /Budget/ })
    expect(budget).toHaveAttribute('aria-valuetext', '$2,000 per person')
  })
})

/**
 * Token-hygiene guard. ``tailwind.config.js`` defines ONLY the accent / ink /
 * canvas scales — there is no ``brand-*`` scale, and ``slate-*`` / ``bg-white``
 * are off-palette. Any such class compiles to nothing, leaving the form's focus
 * rings, progress bar and selected states SILENTLY INERT and visually orphaned
 * from the rest of the app. This scans the component source so the regression
 * (it previously shipped ~28 inert ``brand-*`` classes) can never reappear.
 */
describe('PreferenceForm color-token hygiene', () => {
  // Vitest runs with `web/` as the cwd, so resolve the component from there.
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/PreferenceForm.tsx'),
    'utf8',
  )

  it('uses no inert brand-*, slate-*, or bg-white classes', () => {
    const offenders = source.match(/\b(?:brand-[\w/-]+|slate-[\w/-]+|bg-white)\b/g)
    expect(offenders).toBeNull()
  })
})
