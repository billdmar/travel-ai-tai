# Redesign Integration — shipped to `main`

**Status:** All four parallel redesign branches are merged into `main`, built, tested, and deployed (Render auto-deploys `main`).

This document records the integration of the 4-terminal parallel frontend+backend redesign of Travel AI (TAI).

## 1. Branches integrated

All four were **pairwise disjoint** — zero file overlap, zero merge conflicts.

| Branch | Terminal | Scope |
|---|---|---|
| `feat/redesign-backend` | T3 | Hobby-driven destination discovery (`/destinations`, prompts, models, mock provider) |
| `feat/redesign-images-affiliate` | T4 | Affiliate booking links (`api/affiliate.py`) + Unsplash image proxy (`/images`); `booking_url` on `Activity` |
| `feat/redesign-fe-core` | T1 | Design system (`components/ui` barrel), router (`App.tsx`), discovery flow, destination imagery, Home/Discover/Results/TripDetails pages |
| `feat/redesign-fe-itinerary` | T2 | Restyled itinerary rendering + content pages |

## 2. Frontend routes (in `App.tsx`)

| Route | Component |
|---|---|
| `/` | `HomePage` |
| `/discover` | `DiscoverPage` |
| `/results` | `ResultsPage` |
| `/plan/:destination` | `TripDetailsPage` |
| `/itinerary/:id` | `ItineraryPage` |
| `/saved` | `SavedItinerariesPage` |
| `/how-it-works` | `HowItWorksPage` |
| `/about` | `AboutPage` |
| `/disclosure` | `DisclosurePage` |

All pages lazy-loaded via `React.lazy` + `Suspense`.

## 3. Affiliate / booking flow (end-to-end, verified)

- Backend `RecommendationEngine.generate` attaches a server-owned `booking_url` to every bookable activity (`api/recommend.py`), `None` for `food`/`other`.
- `Activity.booking_url: str | None` is a **declared** Pydantic field (`api/models.py`), so it serializes into the API JSON response.
- Web `Activity.booking_url?: string` (`web/src/types/itinerary.ts`) — consumed by `DayCard`, which renders a **"Book"** link (new tab, `rel="noopener noreferrer"`) only when present, beside the existing Map link + pricing.
- An FTC affiliate-disclosure banner in `ItineraryView` links to `/disclosure` (full disclosure + FAQ).

## 4. Motion / `Reveal` usage

The shipped `Reveal` (T1) supports `as` and `index` (stagger). List items in `SavedItinerariesPage` and `HowItWorksPage` use `<Reveal as="li" index={i}>` (valid `<ul>`/`<ol>` markup — no `<div>` wrapper inside a list), and `ItineraryView` day cards use `index={i}` for sequenced entrance motion. All animation is reduced-motion-safe (renders a plain element when the user prefers reduced motion).

`SavedItinerariesPage` "View" is in-page (fetches + renders `ItineraryView` inline) rather than deep-linking to `/itinerary/:id` — original behavior preserved. The legacy `onNavigateHome?` prop falls back to `navigate('/discover')`.

## 5. Verification (local)

| Check | Result |
|---|---|
| `cd web && npm run build` (`tsc -b && vite build`) | ✅ clean — all pages compile & bundle |
| `pytest` (mock provider) | ✅ **76 passed** |
| Merge conflicts | none (branches disjoint) |

**Notes:**
- The backend suite must run with `LLM_PROVIDER=mock` (CI default). The local `.env` pins `LLM_PROVIDER=gemini`; under that setting `api/main.py` instantiates the Gemini provider at import and the EOL `google.generativeai` `FutureWarning` trips `filterwarnings=error`. Pre-existing environmental condition, not introduced by the integration. (Follow-up: migrate `google-generativeai` → `google-genai`.)
- `.env` (contains a live `GEMINI_API_KEY`) is gitignored and **not** part of any branch.
- A first `tsc -b` after a branch switch may report spurious "file not found" from a stale `node_modules/.tmp/*.tsbuildinfo`; deleting it resolves it.
