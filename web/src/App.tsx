import { lazy, Suspense } from 'react'
import {
  BrowserRouter,
  NavLink,
  Route,
  Routes,
  Link,
} from 'react-router-dom'
import { Container } from './components/ui'
import PageTransition from './components/PageTransition'

// Lazy routes. Pages owned by Terminal 1 (Home/Discover/Results/TripDetails)
// and Terminal 2 (Itinerary/Saved/HowItWorks/About/Disclosure). Terminal 2's
// files resolve after the integration merge; the route table itself is FINAL.
const HomePage = lazy(() => import('./pages/HomePage'))
const DiscoverPage = lazy(() => import('./pages/DiscoverPage'))
const ResultsPage = lazy(() => import('./pages/ResultsPage'))
const TripDetailsPage = lazy(() => import('./pages/TripDetailsPage'))
const ItineraryPage = lazy(() => import('./pages/ItineraryPage'))
const SavedItinerariesPage = lazy(() => import('./pages/SavedItinerariesPage'))
const HowItWorksPage = lazy(() => import('./pages/HowItWorksPage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const DisclosurePage = lazy(() => import('./pages/DisclosurePage'))

const NAV = [
  { to: '/discover', label: 'Discover' },
  { to: '/saved', label: 'Saved' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/about', label: 'About' },
]

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-line bg-canvas/80 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2.5 text-lg font-semibold tracking-tightish text-ink"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-500 text-sm text-white">
            ✦
          </span>
          Travel&nbsp;AI <span className="text-ink-faint">(TAI)</span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent-50 text-accent-700'
                    : 'text-ink-soft hover:bg-canvas-sunken hover:text-ink'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </Container>
    </header>
  )
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-ink-line bg-canvas-raised">
      <Container className="flex flex-col items-center justify-between gap-3 py-8 text-sm text-ink-faint sm:flex-row">
        <p>Travel AI (TAI) — LLM-powered itinerary generator</p>
        <nav className="flex items-center gap-4">
          <Link to="/how-it-works" className="hover:text-ink">
            How it works
          </Link>
          <Link to="/about" className="hover:text-ink">
            About
          </Link>
          <Link to="/disclosure" className="hover:text-ink">
            Disclosure
          </Link>
        </nav>
      </Container>
    </footer>
  )
}

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-ink-faint">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-ink-line border-t-accent-500" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col bg-canvas text-ink">
        <Header />
        <main className="flex-1">
          <Suspense fallback={<RouteFallback />}>
            <PageTransition>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/discover" element={<DiscoverPage />} />
                <Route path="/results" element={<ResultsPage />} />
                <Route path="/plan/:destination" element={<TripDetailsPage />} />
                <Route path="/itinerary/:id" element={<ItineraryPage />} />
                <Route path="/saved" element={<SavedItinerariesPage />} />
                <Route path="/how-it-works" element={<HowItWorksPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/disclosure" element={<DisclosurePage />} />
              </Routes>
            </PageTransition>
          </Suspense>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  )
}
