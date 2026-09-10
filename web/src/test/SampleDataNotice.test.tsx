import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SampleDataNotice } from '../components/SampleDataNotice'

describe('SampleDataNotice', () => {
  it('says plainly that a mock itinerary was not model-written', () => {
    render(<SampleDataNotice provider="mock" />)
    expect(
      screen.getByText(/not written by a language model/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/built-in sample generator/i)).toBeInTheDocument()
  })

  it('names what is still real, so the whole page does not read as fake', () => {
    render(<SampleDataNotice provider="mock" />)
    const body = screen.getByText(/Everything around it is the real service/i)
    expect(body).toHaveTextContent('validated against the same schema')
    expect(body).toHaveTextContent('costs are recomputed server-side')
  })

  it('emits no stray whitespace into the accessible text', () => {
    // The copy is assembled from a conditional lead plus static prose. Built
    // inline as a multi-line template literal it would carry JSX indentation
    // into the DOM -- invisible once HTML collapses it, but present for screen
    // readers and copy-paste.
    render(<SampleDataNotice provider="mock" />)
    const body = screen.getByText(/Everything around it is the real service/i)
    expect(body.textContent).not.toMatch(/\s{2,}|\n/)
  })

  it('quotes the fallback reason when the server supplied one', () => {
    render(<SampleDataNotice provider="mock" fallbackReason="gemini quota exhausted" />)
    expect(
      screen.getByText(/live model was unavailable \(gemini quota exhausted\)/i),
    ).toBeInTheDocument()
  })

  it('falls back to the no-API-key wording when no reason is given', () => {
    render(<SampleDataNotice provider="mock" />)
    expect(screen.getByText(/runs without an API key/i)).toBeInTheDocument()
    expect(screen.queryByText(/live model was unavailable/i)).not.toBeInTheDocument()
  })

  it.each(['gemini', 'openai', 'anthropic', 'langchain'])(
    'renders nothing for the real %s provider',
    (provider) => {
      const { container } = render(<SampleDataNotice provider={provider} />)
      expect(container).toBeEmptyDOMElement()
    },
  )

  it('renders nothing when provider is missing, rather than crying wolf', () => {
    const { container } = render(<SampleDataNotice provider={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('is an aside labelled by its own heading, not an alert', () => {
    render(<SampleDataNotice provider="mock" />)
    // role="alert" would announce this as an error; it is standing context, so
    // it must stay a complementary landmark.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      screen.getByRole('complementary', { name: /not written by a language model/i }),
    ).toBeInTheDocument()
  })
})
