import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { recommendDestinations } from '../api/client'
import { ApiError } from '../api/client'
import type { ResultsLocationState } from '../types/discovery'
import {
  Button,
  Container,
  Reveal,
  Section,
  softGlow,
  variableSerif,
} from '../components/ui'

// Curated hobby palette. Order is deliberate — broad-appeal first.
const HOBBIES = [
  'Hiking',
  'Food',
  'History',
  'Diving',
  'Nightlife',
  'Art',
  'Nature',
  'Wellness',
  'Beaches',
  'Architecture',
  'Wildlife',
  'Photography',
  'Music',
  'Shopping',
  'Adventure',
  'Local culture',
]

export default function DiscoverPage() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [freeText, setFreeText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (hobby: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(hobby)) next.delete(hobby)
      else next.add(hobby)
      return next
    })
  }

  const canSubmit = (selected.size > 0 || freeText.trim().length > 0) && !loading

  const handleSubmit = async () => {
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    const hobbies = [...selected]
    const free_text = freeText.trim() || undefined
    try {
      const res = await recommendDestinations({ hobbies, free_text })
      const state: ResultsLocationState = {
        hobbies,
        free_text,
        recommendations: res.recommendations,
      }
      navigate('/results', { state })
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('We are getting a lot of requests right now — try again in a moment.')
      } else if (err instanceof ApiError && err.status === 503) {
        setError('The recommendation service is briefly unavailable. Please try again.')
      } else {
        setError('Something went wrong fetching recommendations. Please try again.')
      }
      setLoading(false)
    }
  }

  return (
    <Section size="cozy" className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={softGlow('top-left')}
      />
      <Container narrow>
        <Reveal>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent-700">
            Step 1 of 2
          </p>
          <h1
            className="mt-4 font-serif text-5xl font-medium leading-[1.05] tracking-tight text-ink sm:text-6xl"
            style={variableSerif(560)}
          >
            What do you love to do?
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-ink-soft">
            Pick a few — or many. The more you tell us, the better the match.
          </p>
        </Reveal>

        <Reveal index={1}>
          <div className="mt-10 flex flex-wrap gap-2.5">
            {HOBBIES.map((hobby) => {
              const active = selected.has(hobby)
              return (
                <button
                  key={hobby}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(hobby)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition-[color,background-color,border-color,transform] duration-hover ease-lux motion-safe:hover:-translate-y-0.5 ${
                    active
                      ? 'border-accent-500 bg-accent-500 text-white shadow-frame'
                      : 'border-ink-line bg-canvas-raised text-ink-soft hover:border-accent-300 hover:text-ink'
                  }`}
                >
                  {hobby}
                </button>
              )
            })}
          </div>
        </Reveal>

        <Reveal index={2}>
          <div className="mt-10">
            <label
              htmlFor="free-text"
              className="block text-sm font-medium text-ink"
            >
              Anything else? <span className="text-ink-faint">(optional)</span>
            </label>
            <textarea
              id="free-text"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              rows={3}
              placeholder="e.g. somewhere walkable with great coffee and not too touristy, traveling in spring…"
              className="mt-2 w-full resize-none rounded-xl border border-ink-line bg-canvas-raised px-4 py-3 text-ink placeholder:text-ink-faint focus:border-accent-400 focus:outline-none"
            />
          </div>
        </Reveal>

        {error ? (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}

        <Reveal index={3}>
          <div className="mt-8 flex items-center gap-4">
            <Button onClick={handleSubmit} size="lg" disabled={!canSubmit}>
              {loading ? 'Finding destinations…' : 'Find my destinations →'}
            </Button>
            {selected.size > 0 ? (
              <span className="text-sm text-ink-faint">
                {selected.size} selected
              </span>
            ) : null}
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
