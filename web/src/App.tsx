import { useState } from 'react'
import HomePage from './pages/HomePage'
import SavedItinerariesPage from './pages/SavedItinerariesPage'

type Page = 'home' | 'saved'

export default function App() {
  const [page, setPage] = useState<Page>('home')

  const navClass = (active: boolean) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
      active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
    }`

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <button
            type="button"
            onClick={() => setPage('home')}
            className="flex items-center gap-2 rounded-lg text-lg font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
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
              aria-current={page === 'home' ? 'page' : undefined}
              className={navClass(page === 'home')}
            >
              Plan a trip
            </button>
            <button
              type="button"
              onClick={() => setPage('saved')}
              aria-current={page === 'saved' ? 'page' : undefined}
              className={navClass(page === 'saved')}
            >
              Saved itineraries
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        {page === 'home' ? (
          <HomePage onNavigateSaved={() => setPage('saved')} />
        ) : (
          <SavedItinerariesPage onNavigateHome={() => setPage('home')} />
        )}
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-500">
        Travel AI (TAI) — LLM-powered itinerary generator
      </footer>
    </div>
  )
}
