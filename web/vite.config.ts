import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA / offline support. The plugin (Workbox under the hood) precaches the
    // built app shell and registers a service worker so a generated trip stays
    // viewable offline. `autoUpdate` swaps in new builds silently on next load
    // (main.tsx calls registerSW({ immediate: true })). The web manifest already
    // lives at public/manifest.json, so we keep `manifest: false` and only point
    // the generated <link rel="manifest"> at it.
    VitePWA({
      registerType: 'autoUpdate',
      // Don't auto-inject a registration script; main.tsx owns registration so
      // it can be guarded to PROD-only (jsdom/dev have no real SW).
      injectRegister: null,
      manifest: false,
      // Reference the existing static manifest instead of generating one.
      manifestFilename: 'manifest.json',
      includeAssets: ['favicon.svg', 'icon-192.svg', 'icon-512.svg', 'og-image.svg'],
      workbox: {
        // Precache the built app shell (JS/CSS/HTML/SVG emitted by the build).
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2}'],
        // SPA fallback so deep links resolve to index.html when offline.
        navigateFallback: 'index.html',
        // Don't precache the runtime-cached API/image responses.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // A viewed itinerary: serve fresh when online, fall back to the last
            // cached copy when offline so the trip stays readable.
            urlPattern: /\/api\/v1\/itineraries\/[^/?#]+$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tai-itineraries',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Images (Unsplash proxy + destination images): cache-first with a
            // bounded LRU so a trip's photos survive going offline.
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith('/api/v1/images') ||
              request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'tai-images',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      // Let the dev server work without a SW; we only register in PROD builds.
      devOptions: { enabled: false },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Split heavy, rarely-changing libs into a long-cached vendor chunk so
        // app-code edits don't bust the browser cache for them.
        manualChunks(id) {
          if (
            /node_modules\/(react|react-dom|framer-motion|react-router-dom)\//.test(
              id,
            )
          ) {
            return 'vendor'
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
