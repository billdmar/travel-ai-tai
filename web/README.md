# Travel AI (TAI) — Web Frontend

The React single-page app for **Travel AI (TAI)**, an LLM-powered itinerary
generator. Users discover destinations from their interests, fill in a
preference form, and get back a structured day-by-day plan they can view as a list
or on a map, save, export, and share.

This package is the frontend only. It talks to the FastAPI backend (see the
[repository README](../README.md)) over a small typed API client. For a full-stack
request-flow overview, see [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

## Stack

- **React 19** + **TypeScript**, built with **Vite**.
- **React Router** (`react-router-dom` v7) for client-side routing, with lazy-loaded
  route components and a `prefers-reduced-motion`-aware page transition.
- **Tailwind CSS** for styling; **Framer Motion** for the (reduced-motion-respecting)
  animations.
- **Leaflet** for the interactive itinerary map, code-split so it only loads when the
  traveler switches to the Map view.
- **Vitest** + **Testing Library** (React Testing Library + `jest-dom`, jsdom env)
  for component and client tests.
- **ESLint** (typescript-eslint, react-hooks, react-refresh) for linting.

## Getting started

`node_modules` is not committed, and the app depends on Leaflet, so install first:

```bash
npm install
```

| Task | Command | Notes |
|------|---------|-------|
| Dev server | `npm run dev` | http://localhost:5173 — proxies `/api` and `/health` to the backend at `http://localhost:8000` (see `vite.config.ts`). |
| Tests | `npm test` | Runs the Vitest suite once (`vitest run`). |
| Coverage | `npm run test:cov` | Vitest with a coverage report. |
| Lint | `npm run lint` | `eslint .` |
| Production build | `npm run build` | Type-checks (`tsc -b`) then emits a static bundle to `web/dist/`. |
| Preview build | `npm run preview` | Serves the built `dist/` locally. |

Run the backend in a separate terminal (`uvicorn api.main:app --reload`) so the dev
proxy has something to talk to — the repository README covers backend setup. In
production the FastAPI app serves the built `web/dist/` as a static SPA, so the same
`/api/v1` paths work without a proxy.

## Project layout

```
web/src/
├── App.tsx               # Router, header/footer, lazy routes, page transitions
├── main.tsx              # React root + global CSS
├── api/
│   └── client.ts         # Typed fetch wrapper + ApiError; one fn per endpoint
├── types/
│   ├── itinerary.ts      # TravelPreferences / ItineraryResponse — mirror Pydantic
│   └── discovery.ts      # Destination-recommendation + image types
├── pages/                # One component per route (Home, Discover, Results,
│                         # TripDetails, Itinerary, Saved, Explore, Destination,
│                         # Share, HowItWorks, About, Disclosure)
├── components/           # ItineraryView, DayCard, MapView, CostBreakdown,
│   │                     # PackingChecklist, ExportShareButton, …
│   ├── ui/               # Design-system primitives (Button, Container, Reveal, …)
│   └── explore/          # Explore/Discover cards + curated-destination data
├── seo/                  # Per-route <title> management
├── lib/                  # Small pure helpers (currency formatting, …)
├── assets/               # Bundled hero + destination photos (WebP) and fallbacks
└── test/                 # Vitest + Testing Library specs and fixtures
```

## Routes

Defined in `src/App.tsx` (all route components are lazy-loaded):

| Path | Page | Purpose |
|------|------|---------|
| `/` | HomePage | Landing / hero |
| `/discover` | DiscoverPage | Turn interests into destination ideas |
| `/results` | ResultsPage | Recommended destinations |
| `/explore` | ExplorePage | Curated destination atlas |
| `/destination/:slug` | DestinationLandingPage | Editorial destination landing |
| `/plan/:destination` | TripDetailsPage | Trip preference form |
| `/itinerary/:id` | ItineraryPage | Generated itinerary (list/map) |
| `/saved` | SavedItinerariesPage | Saved trips |
| `/share/:token` | SharePage | Public, read-only shared itinerary |
| `/how-it-works`, `/about`, `/disclosure` | static pages | |

## Notable features

- **Itinerary view with List ↔ Map toggle** (`components/ItineraryView.tsx`). The
  default List view renders collapsible day cards; the Map view lazy-loads Leaflet
  and plots every activity that has coordinates. Owner controls (Save / Export /
  Share) are hidden in `readOnly` mode so a shared link can't be mutated.
- **Trip preference form** (`pages/TripDetailsPage.tsx`) capturing dates, budget,
  group size, pace, travel style, and notes (dietary & accessibility needs are
  carried through when adjusting an existing trip), posted as `TravelPreferences`
  to `POST /api/v1/itineraries`.
- **Export** (`components/ExportShareButton.tsx`) downloads an itinerary as
  **Markdown**, **PDF**, or **ICS** calendar via
  `GET /api/v1/itineraries/{id}/export?format=…`.
- **Share links** — `POST /api/v1/itineraries/{id}/share` mints a public token; the
  `/share/:token` page renders the trip read-only via `GET /api/v1/shared/{token}`.
- **Curated destinations** — the Explore gallery loads
  `GET /api/v1/destinations/curated` and gracefully falls back to a bundled static
  array if the endpoint is unavailable, so the page never breaks.
- **Resilient images** — `GET /api/v1/images?query=` is proxied through the backend;
  on any failure the client returns a synthetic `fallback: true` result so
  `DestinationImage` renders a bundled asset instead of throwing.
- **Streaming generation** — `client.ts`'s `streamItinerary` consumes the backend's
  `text/event-stream` (`POST /api/v1/itineraries/stream`) over `fetch` +
  `ReadableStream`, surfacing chunks as they arrive and resolving with the final
  `ItineraryResponse`.

## How it talks to the API

`src/api/client.ts` is the single seam between UI and backend. Every call goes
through a `request<T>()` helper that:

- prefixes the `/api/v1` base path (relative, so the Vite dev proxy and the
  production static mount both resolve correctly — no `VITE_*` base URL needed);
- sets `Content-Type: application/json` and parses the JSON body;
- throws a typed `ApiError(status, body, retryAfterSeconds)` for any non-2xx or
  network failure, so pages can branch on status (e.g. 422 validation, 429 rate
  limit with `Retry-After`, 503 LLM-unavailable) and render the right error state.

The request/response types in `src/types/` mirror the backend Pydantic models field
for field, so the contract is checked at compile time.

## Testing

The Vitest suite (`src/test/`) runs in jsdom with React Testing Library and a shared
`setup.ts`. It covers the API client (error mapping, retry-after parsing), the
list/map toggle and read-only mode of `ItineraryView`, the preference form, export &
share, the discover/explore/results pages, error boundaries, and route titles. Run
it with `npm test`.
