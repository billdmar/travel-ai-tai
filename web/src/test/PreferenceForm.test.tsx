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
