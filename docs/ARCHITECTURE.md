# Architecture

A concise full-stack overview of Travel AI (TAI). For setup and the feature list see
the [repository README](../README.md); for the frontend specifically see
[`web/README.md`](../web/README.md).

TAI is a single deployable unit: a **FastAPI** async backend (`api/`) that, in
production, also serves the built **React/Vite** SPA (`web/`) as static files. In
local dev the SPA runs on Vite's dev server and proxies `/api` to the backend.

## Request flow: preferences → itinerary

The core path turns a `TravelPreferences` payload into a persisted, validated
itinerary:

```
TripDetailsPage (web)                        FastAPI (api/)
─────────────────────                        ──────────────
POST /api/v1/itineraries  ──────────────▶    routes/itineraries.py
  { destination, dates, budget,                 └─ RecommendationEngine.generate()  (api/recommend.py)
    interests, pace, travel_style,                   ├─ cache key = SHA-256(preferences)   (api/cache.py)
    dietary_needs,                                   │     hit → return stored itinerary, no LLM call
    accessibility_needs, … }                         ├─ build schema-locked prompt        (api/llm/prompts/)
                                                      ├─ LLMProvider.complete()  →  LLMResult(text, tokens_used,
ItineraryResponse  ◀──────────────────────           │     fallback_reason)              (api/llm/provider.py)
  { id, created_at, preferences,                      │     mock | openai | gemini | langchain
    days[…], total_estimated_cost_usd,                ├─ validate JSON against Pydantic models  (api/models.py)
    currency, summary, tips, provider }               ├─ attach server-owned id/created_at/preferences
                                                      └─ persist → SQLAlchemy async session   (api/db.py)
```

Key invariants:

- **The LLM returns only creative content.** Server-owned fields (`id`,
  `created_at`, echoed `preferences`) are attached by the engine, not the model —
  see `api/models.py` and `api/recommend.py`.
- **Identical preferences are idempotent.** The same preference payload hashes to the
  same cache key (`api/cache.py`), so a repeat request returns the *same* stored
  itinerary rather than re-calling the LLM (the dominant cost/latency source).
- **Graceful degradation.** Transient provider errors retry with backoff; on
  exhaustion the route returns `503` with `Retry-After`. With no API key the provider
  falls back to the deterministic mock, so the app is fully functional offline.

## LLM provider abstraction

`api/llm/provider.py` defines the `LLMProvider` contract — `complete()` returns an
`LLMResult(text, tokens_used, fallback_reason)`. Implementations live alongside it:

- `mock_provider.py` — deterministic stub used by every test and by local/demo runs
  (zero cost, no key).
- `openai_provider.py` — OpenAI structured-output generation (default when a key is
  set).
- `gemini_provider.py`, `langchain_provider.py` — alternative backends.

Prompts are kept out of code in `api/llm/prompts/` so the JSON contract the model
must satisfy is reviewable in one place.

## Persistence & schema

SQLAlchemy 2.0 async (`api/db.py`) with an async engine + `async_sessionmaker`; the
default `DATABASE_URL` is SQLite (`sqlite+aiosqlite`), swappable to Postgres
(`postgresql+asyncpg`) with one env var.

The schema is **Alembic-managed** — migrations in `migrations/versions/` form a
4-revision chain ending at head `e3ab67743567` (which adds the curated-destinations
table and seed data). On startup the app runs `run_migrations()` (`api/db.py`) so the
database is always at head.

## Other surfaces

- **SSE streaming** — `routes/stream.py` (with `api/llm/streaming.py`) serves
  `POST /api/v1/itineraries/stream` as `text/event-stream`, emitting chunks and a
  terminal event carrying the full `ItineraryResponse`. The frontend consumes it via
  `fetch` + `ReadableStream` (`web/src/api/client.ts` → `streamItinerary`), since
  `EventSource` cannot POST a body.
- **Image proxy + cache** — `routes/images.py` proxies Unsplash behind a `TTLCache`
  so the access key never reaches the browser. Any failure (or missing key) returns a
  `{ fallback: true }` envelope so the UI can show a bundled placeholder instead of
  breaking.
- **Curated destinations** — `routes/curated_destinations.py` serves the DB-backed
  Explore atlas (`GET /api/v1/destinations/curated`); the frontend falls back to a
  bundled static list if it's unavailable.
- **Sharing & export** — `routes/share.py` mints public read-only tokens
  (`api/share.py`); `routes/export.py` renders Markdown / PDF / ICS downloads
  (`api/export.py`). `routes/og.py` renders a 1200×630 PNG Open Graph card per itinerary
  (`GET /api/v1/itineraries/{id}/og-image`, cached ~1h) so shared links preview nicely.
- **Editing & regeneration** — `routes/itineraries.py` also exposes
  `POST /api/v1/itineraries/{id}/regenerate` (re-run generation from adjusted preferences,
  new id, source untouched) and client-side editing via
  `PUT /api/v1/itineraries/{id}/days/{n}/activities` +
  `DELETE …/activities/{i}`.
- **Operational concerns** — per-IP rate limiting (`api/ratelimit.py`, `429` +
  `Retry-After`), request/error middleware (`api/middleware.py`), a dependency-free
  `/health` liveness probe and a DB+cache-checking `/ready` readiness probe
  (`routes/health.py`).
- **Observability (opt-in, no-op by default)** — the `RequestIDMiddleware`
  (`api/middleware.py`) stamps a request id + path/method/IP into contextvars so the JSON
  log formatter (`api/logging_config.py`) tags every line. When `ENABLE_METRICS=true`,
  `MetricsMiddleware` records Prometheus request latency/count and `routes/metrics.py`
  exposes `GET /metrics`. When `SENTRY_DSN` is set, `init_sentry` (`api/observability.py`)
  wires unhandled-exception reporting; with no DSN the SDK never loads.
- **PWA / service worker** — the frontend registers a service worker via
  `vite-plugin-pwa` (`web/vite.config.ts`, `web/src/pwa/register.ts`) against the static
  `web/public/manifest.json`, so the app shell is installable and works offline.

## Routing & startup order

`api/main.py` registers the health and itinerary routers first and **mounts the
static SPA last** (`StaticFiles(..., html=True)` at `/`), so API routes always take
precedence over the SPA catch-all that serves `index.html` for client-side routes.
