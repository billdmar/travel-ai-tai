import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PackingChecklist from '../components/PackingChecklist'
import { makeActivity, makeDay, makeItinerary, makePreferences } from './fixtures'

describe('PackingChecklist', () => {
  afterEach(() => vi.restoreAllMocks())

  it('is collapsed by default and shows a "0 of N packed" progress line', () => {
    render(<PackingChecklist itinerary={makeItinerary()} />)
    expect(screen.getByRole('button', { name: /Packing checklist/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.getByText(/^0 of \d+ packed/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('expands to reveal the generated groups and items', async () => {
    const user = userEvent.setup()
    render(<PackingChecklist itinerary={makeItinerary()} />)
    await user.click(screen.getByRole('button', { name: /Packing checklist/ }))
    expect(screen.getByText('Essentials')).toBeInTheDocument()
    expect(screen.getByText('Passport / ID and travel documents')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0)
  })

  it('increments the packed count when an item is checked', async () => {
    const user = userEvent.setup()
    render(<PackingChecklist itinerary={makeItinerary()} />)
    await user.click(screen.getByRole('button', { name: /Packing checklist/ }))
    const first = screen.getAllByRole('checkbox')[0]
    expect(first).not.toBeChecked()
    await user.click(first)
    expect(first).toBeChecked()
    expect(screen.getByText(/^1 of \d+ packed/)).toBeInTheDocument()
  })

  it('tailors clothing to a summer start date', async () => {
    const user = userEvent.setup()
    const it = makeItinerary({
      preferences: makePreferences({ start_date: '2026-07-01' }),
    })
    render(<PackingChecklist itinerary={it} />)
    await user.click(screen.getByRole('button', { name: /Packing checklist/ }))
    expect(screen.getByText('Sun hat and sunglasses')).toBeInTheDocument()
  })

  it('tailors clothing to a winter start date', async () => {
    const user = userEvent.setup()
    const it = makeItinerary({
      preferences: makePreferences({ start_date: '2026-12-15' }),
    })
    render(<PackingChecklist itinerary={it} />)
    await user.click(screen.getByRole('button', { name: /Packing checklist/ }))
    expect(screen.getByText('Gloves, hat and scarf')).toBeInTheDocument()
  })

  it('adds activity- and preference-derived items (dietary + leisure)', async () => {
    const user = userEvent.setup()
    const it = makeItinerary({
      preferences: makePreferences({ dietary_needs: ['vegetarian'] }),
      days: [makeDay({ activities: [makeActivity({ category: 'leisure' })] })],
    })
    render(<PackingChecklist itinerary={it} />)
    await user.click(screen.getByRole('button', { name: /Packing checklist/ }))
    expect(screen.getByText('Swimwear and a quick-dry towel')).toBeInTheDocument()
    expect(screen.getByText('Dietary note to show: vegetarian')).toBeInTheDocument()
  })

  it('adds a smart-outfit item for luxury travel style', async () => {
    const user = userEvent.setup()
    const it = makeItinerary({
      preferences: makePreferences({ travel_style: 'luxury' }),
    })
    render(<PackingChecklist itinerary={it} />)
    await user.click(screen.getByRole('button', { name: /Packing checklist/ }))
    expect(
      screen.getByText('A smart outfit for upscale dining or venues'),
    ).toBeInTheDocument()
  })
})
