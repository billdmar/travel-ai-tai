import { useState } from 'react'
import HomePage from './pages/HomePage'
import SavedItinerariesPage from './pages/SavedItinerariesPage'

type Page = 'home' | 'saved'

export default function App() {
  const [page, setPage] = useState<Page>('home')

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <button
            type="button"
            onClick={() => setPage('home')}
            className="flex items-center gap-2 text-lg font-bold text-slate-900"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
              ✈
            </span>
            Travel AI
          </button>
          <nav className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage('home')}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                page === 'home'
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Plan a trip
            </button>
            <button
              type="button"
              onClick={() => setPage('saved')}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                page === 'saved'
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Saved itineraries
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        {page === 'home' ? <HomePage /> : <SavedItinerariesPage />}
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-400">
        Travel AI (TAI) — LLM-powered itinerary generator
      </footer>
    </div>
  )
}
