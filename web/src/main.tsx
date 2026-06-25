import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import OfflineBanner from './pwa/OfflineBanner.tsx'
import { registerServiceWorker } from './pwa/register.ts'

// Register the PWA service worker so the app shell, viewed itineraries, and
// images stay available offline. No-op in dev/test (guarded on import.meta.env.PROD).
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <OfflineBanner />
    </ErrorBoundary>
  </StrictMode>,
)
