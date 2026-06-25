import { lazy, Suspense, useEffect, useState } from 'react'
import {
  BrowserRouter,
  NavLink,
  Route,
  Routes,
  Link,
} from 'react-router-dom'
import { Container } from './components/ui'
import PageTransition from './components/PageTransition'
import RouteTitles from './seo/RouteTitles'

// Lazy routes. Pages owned by Terminal 1 (Home/Discover/Results/TripDetails)
// and Terminal 2 (Itinerary/Saved/HowItWorks/About/Disclosure). Terminal 2's
// files resolve after the integration merge; the route table itself is FINAL.
const HomePage = lazy(() => import('./pages/HomePage'))
const DiscoverPage = lazy(() => import('./pages/DiscoverPage'))
const ResultsPage = lazy(() => import('./pages/ResultsPage'))
const TripDetailsPage = lazy(() => import('./pages/TripDetailsPage'))
const ItineraryPage = lazy(() => import('./pages/ItineraryPage'))
const SavedItinerariesPage = lazy(() => import('./pages/SavedItinerariesPage'))
const ComparePage = lazy(() => import('./pages/ComparePage'))
const HowItWorksPage = lazy(() => import('./pages/HowItWorksPage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const DisclosurePage = lazy(() => import('./pages/DisclosurePage'))
// New surfaces (FOUNDATION wires the routes; owners fill the pages).
const ExplorePage = lazy(() => import('./pages/ExplorePage'))
const DestinationLandingPage = lazy(() => import('./pages/DestinationLandingPage'))
const SharePage = lazy(() => import('./pages/SharePage'))

const NAV = [
  { to: '/discover', label: 'Discover' },
  { to: '/saved', label: 'Saved' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/about', label: 'About' },
]

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-accent-50 text-accent-700'
      : 'text-ink-soft hover:bg-canvas-sunken hover:text-ink'
  }`

function Header() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  // Let keyboard users dismiss the open mobile menu with Escape, matching the
  // dismiss affordance sighted users get from tapping the toggle again.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <header className="sticky top-0 z-40 border-b border-ink-line bg-canvas/80 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between">
        <Link
          to="/"
          onClick={close}
          className="flex items-center gap-2.5 text-lg font-semibold tracking-tightish text-ink"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-500 text-sm text-white">
            ✦
          </span>
          Travel&nbsp;AI <span className="text-ink-faint">(TAI)</span>
        </Link>

        {/* Desktop / tablet: inline pills. Hidden on mobile where they overflow. */}
        <nav className="hidden items-center gap-1 sm:flex">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Mobile: a compact toggle that reveals the same links. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="-mr-1.5 inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-canvas-sunken hover:text-ink sm:hidden"
        >
          <span aria-hidden="true" className="text-xl leading-none">
            {open ? '✕' : '≡'}
          </span>
        </button>
      </Container>

      {/* Mobile dropdown panel. Rendered only when open; no animation so it
          respects prefers-reduced-motion by construction. */}
      {open && (
        <nav
          id="mobile-nav"
          className="border-t border-ink-line bg-canvas/95 backdrop-blur-md sm:hidden"
        >
          <Container className="flex flex-col gap-1 py-3">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={close}
                className={({ isActive }) =>
                  `rounded-xl px-4 py-3 text-base font-medium transition-colors ${
                    isActive
                      ? 'bg-accent-50 text-accent-700'
                      : 'text-ink-soft hover:bg-canvas-sunken hover:text-ink'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </Container>
        </nav>
      )}
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
      <RouteTitles />
      <div className="flex min-h-screen flex-col bg-canvas text-ink">
        {/* Skip link: the first focusable element, hidden until focused so
            keyboard users can jump straight past the nav to the page content. */}
        <a
          href="#main-content"
          className="sr-only rounded-full bg-accent-500 px-4 py-2 text-sm font-medium text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
        >
          Skip to main content
        </a>
        <Header />
        <main id="main-content" className="flex-1">
          <Suspense fallback={<RouteFallback />}>
            <PageTransition>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/discover" element={<DiscoverPage />} />
                <Route path="/results" element={<ResultsPage />} />
                <Route path="/plan/:destination" element={<TripDetailsPage />} />
                <Route path="/itinerary/:id" element={<ItineraryPage />} />
                <Route path="/saved" element={<SavedItinerariesPage />} />
                <Route path="/compare" element={<ComparePage />} />
                <Route path="/explore" element={<ExplorePage />} />
                <Route path="/destination/:slug" element={<DestinationLandingPage />} />
                <Route path="/share/:token" element={<SharePage />} />
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
