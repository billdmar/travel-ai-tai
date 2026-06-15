# Travel AI (TAI) — AI Trip Discovery & Itinerary Generator

Don't know where to go yet? Pick the things you love, let an LLM suggest where to go, then
turn any pick into a structured, day-by-day itinerary — all served through a scalable Python
API. TAI is a full-stack reference implementation: a **FastAPI** async backend with a
preference→prompt recommendation engine, OpenAI/Gemini structured-output generation validated
by **Pydantic**, response caching, rate limiting, and persistence — paired with a **React 19 +
Vite + TypeScript + Tailwind** frontend with a guided discovery journey.

[![CI](https://github.com/billdmar/travel-ai-tai/actions/workflows/ci.yml/badge.svg)](https://github.com/billdmar/travel-ai-tai/actions/workflows/ci.yml)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-async-009688?logo=fastapi&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-gpt--4o--mini-412991?logo=openai&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-green)
[![Live Demo](https://img.shields.io/badge/Live_Demo-Open_App-brightgreen?style=flat-square)](https://travel-ai-tai.onrender.com)

**🔗 Live demo:** [https://travel-ai-tai.onrender.com](https://travel-ai-tai.onrender.com) — runs in mock-LLM mode (no API key), so recommendations and itineraries are generated from a deterministic stub. _Free tier sleeps when idle; first request may take ~30s to wake._

---

## Features

- **Discovery flow** — a guided journey: **Home → Discover** (pick hobby chips + optional
  free text) **→ Results** (4-6 AI-recommended destinations as cards) **→ Trip details**
  (dates, budget, group, pace, style) **→ Itinerary** (day-by-day) **→ Save → Saved list**.
  Start from your interests instead of having to already know the destination.
- **Destination recommendations** — hobbies (plus free text) are mapped into an engineered
  discovery prompt; the LLM returns 4-6 destinations, each validated against a Pydantic
  schema with a `why_it_fits` rationale, tags, and a best season. Works on the mock provider
  with no key.
- **Structured itineraries** — destination, dates, budget, interests, pace, dietary &
  accessibility needs → a validated day-by-day plan with per-activity time, place, cost,
  category, and map link.
- **Recommendation engine** — maps structured preferences into an engineered LLM prompt,
  enforces JSON output, and validates every response against a Pydantic schema. The LLM
  never invents server-owned fields (id, timestamps, booking links) — those are attached
  server-side.
- **Destination imagery** — a server-side image proxy (`/api/v1/images`) returns Unsplash
  photos with attribution when a key is configured, and degrades to bundled `.webp` fallback
  art shipped in the frontend when it isn't — the access key never reaches the browser.
- **Affiliate booking links** — itinerary activities carry an optional `booking_url` to the
  most relevant partner (Viator/GetYourGuide tours, Booking.com stays, Kayak flights) by
  category, with partner tags pulled from env vars. Empty tags emit clean, untracked links.
  An FTC affiliate disclosure is shown in the itinerary UI and at `/disclosure`.
- **Pluggable LLM providers** — OpenAI (default when keyed), Gemini, a deterministic **mock**
  (used by all tests and local dev, zero cost / no key), and an optional LangChain wrapper.
- **Production-style API** — async handlers, response caching, per-IP rate limiting,
  retry/backoff, soft-delete, pagination, and auto-generated OpenAPI docs at `/docs`.
- **Minimal, elegant design system** — a warm off-white canvas, charcoal ink, and a single
  muted blue-green accent; the self-hosted **Inter** variable font (no external request); and
  cinematic motion (parallax, scroll reveals) via **framer-motion** with a mandatory
  `prefers-reduced-motion` fallback and lazy-loaded framed images.

## Architecture

```
React 19 (Vite/TS/Tailwind, react-router-dom)   FastAPI (async)
┌──────────────────────────────────┐            ┌──────────────────────────────────────┐
│ /discover  → DiscoverPage         │ POST /api/v1│ routes/destinations.py                 │
│ /results   → ResultsPage          │ ──────────▶ │   └─ build prompt → LLM → validate     │
│            (4-6 destination cards) │ ◀────────── │      DestinationRecommendationResponse │
│ /plan/:dst → TripDetailsPage       │ /images     │ routes/images.py (Unsplash proxy /     │
│ /itinerary/:id → ItineraryPage     │ ──────────▶ │      bundled .webp fallback)           │
│ /saved     → SavedItinerariesPage  │ POST /api/v1│ routes/itineraries.py                  │
│ ItineraryView/DayCard              │ ──────────▶ │   └─ RecommendationEngine.generate()   │
└──────────────────────────────────┘ ItineraryJSON│        ├─ cache key = SHA-256(prefs)   │
                                                   │        ├─ ItineraryCache (TTL/Redis)   │
                                                   │        ├─ LLMProvider.complete()  ◀──┐ │
                                                   │        │   openai|gemini|mock|langchain│
                                                   │        ├─ GeneratedItinerary.validate │ │
                                                   │        ├─ affiliate.booking_url(...)   │
                                                   │        └─ persist → SQLAlchemy (async) │ │
                                                   └──────────────────────────────────────┘ │
                                                     prompts/*.py (schema-locked) ───────────┘
```

For both flows the LLM returns only creative content; the engine attaches server-owned fields.
For itineraries it adds `id`, `created_at`, the echoed `preferences`, and each activity's
`booking_url` to build the full `ItineraryResponse`. This is why repeating an identical request
returns the **same** stored itinerary (cache hit) rather than a fresh LLM call.

## Quickstart (local)

```bash
# Backend (uses the mock provider by default — no API key needed)
uv venv --python 3.11 && uv pip install -r requirements-dev.txt
cp .env.example .env                       # LLM_PROVIDER=mock works out of the box
.venv/bin/uvicorn api.main:app --reload    # http://localhost:8000  (/docs for Swagger)

# Frontend (separate terminal)
cd web && npm install && npm run dev        # http://localhost:5173 (proxies /api → :8000)
```

To use real OpenAI generation, set `OPENAI_API_KEY` and `LLM_PROVIDER=openai` in `.env`.

## Quickstart (Docker)

```bash
docker-compose up --build      # serves API + built React UI from http://localhost:8000
```

The multi-stage `Dockerfile` builds the React frontend, then serves it and the API
from a single Python container. It binds `$PORT` when the platform provides one
(Render/Cloud Run/Heroku) and falls back to `8000` locally.

## Deploy (Render — free)

A [`render.yaml`](render.yaml) blueprint is included for one-click deployment:

1. On [Render](https://render.com), choose **New + → Blueprint** and select this repo.
2. Approve the plan. Render builds the Dockerfile and serves the app at `$PORT`.
3. The blueprint sets `LLM_PROVIDER=mock` and `CACHE_BACKEND=memory`, so the demo
   runs with no API key and no external database.

To enable real OpenAI generation, add an `OPENAI_API_KEY` env var and set
`LLM_PROVIDER=openai` in the Render dashboard.

## API reference

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/destinations/recommend` | Recommend 4-6 destinations from `{hobbies[], free_text?}` → `{recommendations[]}` (works on mock, no key) |
| GET | `/api/v1/images?query=` | Single image for a query → `{url, thumb_url, alt, credit, fallback}` (Unsplash when keyed, else `fallback:true`) |
| POST | `/api/v1/itineraries` | Generate an itinerary from preferences (201) |
| GET | `/api/v1/itineraries/{id}` | Retrieve an itinerary |
| POST | `/api/v1/itineraries/{id}/save` | Mark an itinerary as saved |
| GET | `/api/v1/itineraries?page=&per_page=` | Paginated list of saved itineraries (excludes soft-deleted) |
| DELETE | `/api/v1/itineraries/{id}` | Soft-delete |
| POST | `/api/v1/preferences/validate` | Validate preferences without calling the LLM |
| GET | `/health` | Liveness + version |
| GET | `/docs` | Swagger UI |

`POST /api/v1/destinations/recommend` takes `{hobbies: string[], free_text?: string}` and
returns `{recommendations: [{name, country, why_it_fits, tags[], image_query, best_season}]}`
with 4-6 entries.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `LLM_PROVIDER` | `mock` | `openai` \| `mock` \| `langchain` \| `gemini` (falls back to mock if no key) |
| `OPENAI_API_KEY` | — | Required for the OpenAI/LangChain providers |
| `OPENAI_MODEL` | `gpt-4o-mini` | Chat model |
| `GEMINI_API_KEY` | — | Required for the Gemini provider |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Gemini model |
| `MAX_TOKENS` | `2000` | Per-completion token cap (cost control) |
| `UNSPLASH_ACCESS_KEY` | — | Optional. Enables the `/api/v1/images` proxy; unset ⇒ bundled `.webp` fallback art |
| `AFFILIATE_TAG_VIATOR` | — | Optional. Viator partner tag; empty ⇒ clean untracked links |
| `AFFILIATE_TAG_GYG` | — | Optional. GetYourGuide partner tag |
| `AFFILIATE_TAG_BOOKING` | — | Optional. Booking.com affiliate id |
| `AFFILIATE_TAG_FLIGHTS` | — | Optional. Flights/Kayak affiliate id |
| `DATABASE_URL` | `sqlite+aiosqlite:///./tai.db` | Async DB URL (Postgres-ready) |
| `CACHE_BACKEND` | `memory` | `memory` \| `redis` (Redis falls back to in-memory) |
| `REDIS_URL` | `redis://localhost:6379/0` | Used when `CACHE_BACKEND=redis` |
| `RATE_LIMIT_ENABLED` | `true` | Toggle per-IP rate limiting |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated CORS origins |
| `DEBUG_MODE` | `false` | Exposes `/api/v1/debug/token-stats` |
| `LOG_LEVEL` | `INFO` | Logging verbosity |

See [`.env.example`](.env.example) for the full list with inline notes; copy it to `.env` to
get started. Every variable above is optional — the app boots with zero configuration in
mock mode.

## Scalability design

The backend is built to serve many concurrent users; these are the concrete mechanisms
(and the interview-relevant reasoning behind them):

1. **Async end-to-end.** Every route handler is `async def` and database access uses
   SQLAlchemy 2.0's async engine + `async_sessionmaker`, so the event loop is never
   blocked on I/O — one process handles many in-flight LLM/DB calls concurrently.
2. **Response caching.** Identical preference payloads hash to the same SHA-256 key and
   return the stored itinerary (TTL 1h) instead of re-calling the LLM — the dominant cost
   and latency source. Cache backend is in-memory by default, Redis-swappable for
   multi-process horizontal scaling.
3. **Rate limiting.** `slowapi` caps `POST /itineraries` at 10 req/min/IP, protecting the
   upstream LLM budget and the service from abuse; returns `429` with `Retry-After`.
4. **Retry & graceful degradation.** `tenacity` retries transient OpenAI rate-limit/timeout
   errors with exponential backoff; on exhaustion the API returns `503` with `Retry-After`
   rather than hanging.
5. **Connection pooling & stateless design.** SQLAlchemy pooling plus stateless handlers
   mean the API scales horizontally behind a load balancer; SQLite is the default,
   Postgres is a one-line `DATABASE_URL` swap.

> **Honest scope note.** The resume frames this project as "serving 200+ users." That is a
> *design target* demonstrated by the mechanisms above and a concurrency smoke test
> (`tests/test_concurrency_smoke.py` fires many simultaneous requests against the mock
> provider and asserts they all succeed) — **not** a measured production load test.
> The OpenAI path is implemented and unit-tested via mocked errors, but in this
> environment all runtime verification uses the mock provider (no API key).

## Testing

A **76-test** suite runs entirely against the mock LLM provider — no API key and no
network — so it's fast and deterministic in CI. Coverage spans destination recommendations,
the cache-hit identity guarantee, rate-limit isolation (429), error mapping (503/502),
request validation, save/list behavior, and a concurrency smoke test that fires many
simultaneous requests and asserts they all succeed.

## Development

```bash
.venv/bin/pytest -q                 # full test suite (mock provider, no network)
.venv/bin/ruff check api/ tests/    # lint
cd web && npm run build             # type-check + production build
```

## License

[MIT](LICENSE) © William Mar
