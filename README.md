# Travel AI (TAI) — LLM Itinerary Generator

Enter your travel preferences; get back a structured, day-by-day itinerary generated
by an LLM and served through a scalable Python API. TAI is a full-stack reference
implementation: a **FastAPI** async backend with a preference→prompt recommendation
engine, OpenAI structured-output generation validated by **Pydantic**, response caching,
rate limiting, and persistence — paired with a **React + Vite + TypeScript + Tailwind**
multi-step frontend.

[![CI](https://github.com/billdmar/travel-ai-tai/actions/workflows/ci.yml/badge.svg)](https://github.com/billdmar/travel-ai-tai/actions/workflows/ci.yml)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-async-009688?logo=fastapi&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-gpt--4o--mini-412991?logo=openai&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-green)
[![Live Demo](https://img.shields.io/badge/Live_Demo-Open_App-brightgreen?style=flat-square)](https://travel-ai-tai.onrender.com)

**🔗 Live demo:** [https://travel-ai-tai.onrender.com](https://travel-ai-tai.onrender.com) — runs in mock-LLM mode (no API key), so itineraries are generated from a deterministic stub. _Free tier sleeps when idle; first request may take ~30s to wake._

---

## Features

- **Structured itineraries** — destination, dates, budget, interests, pace, dietary &
  accessibility needs → a validated day-by-day plan with per-activity time, place, cost,
  category, and map link.
- **Recommendation engine** — maps structured preferences into an engineered LLM prompt,
  enforces JSON output, and validates every response against a Pydantic schema. The LLM
  never invents server-owned fields (id, timestamps) — those are attached server-side.
- **Pluggable LLM providers** — OpenAI (default), a deterministic **mock** (used by all
  tests and local dev, zero cost / no key), Gemini, and an optional LangChain wrapper.
- **Destination discovery** — turn a few hobbies (plus optional free text) into 4–6
  tailored destination ideas via `POST /api/v1/destinations/recommend`, each with a fit
  rationale, tags, best season, and an image query.
- **Affiliate booking links** — every bookable activity gets a server-owned `booking_url`
  (Viator/GetYourGuide for attractions & leisure, Booking.com for stays, a flights search
  for transport). Affiliate tags are config-driven and empty by default, so links are
  clean plain deep links with **no tracking params** until you set a tag.
- **Server-side image proxy** — `GET /api/v1/images?query=` proxies Unsplash so the access
  key never reaches the browser; with no key (or any upstream failure) it returns a
  graceful `{fallback:true}` envelope and the UI shows a bundled placeholder.
- **Production-style API** — async handlers, response caching, per-IP rate limiting,
  retry/backoff, soft-delete, pagination, and auto-generated OpenAPI docs at `/docs`.
- **Polished frontend** — a destination-discovery flow, multi-step preference wizard,
  collapsible day cards with Map + Book links, an FTC affiliate-disclosure banner, a
  saved-trips page, and friendly error states for validation / rate-limit / LLM-unavailable
  cases.

## Architecture

```
React (Vite/TS/Tailwind)                FastAPI (async)
┌───────────────────────┐  POST /api/v1  ┌──────────────────────────────────────┐
│ PreferenceForm (4-step)│ ─────────────▶ │ routes/itineraries.py                  │
│ ItineraryView/DayCard  │ ◀───────────── │   └─ RecommendationEngine.generate()   │
└───────────────────────┘   ItineraryJSON │        ├─ cache key = SHA-256(prefs)   │
                                          │        ├─ ItineraryCache (TTL/Redis)   │
                                          │        ├─ LLMProvider.complete()  ◀──┐ │
                                          │        │     openai | mock | langchain│ │
                                          │        ├─ GeneratedItinerary.validate │ │
                                          │        └─ persist → SQLAlchemy (async) │ │
                                          └──────────────────────────────────────┘ │
                                            prompts/itinerary.py (schema-locked) ───┘
```

The LLM returns only creative content (`GeneratedItinerary`); the engine attaches the
server-owned `id`, `created_at`, and echoed `preferences` to build the full
`ItineraryResponse`. This is why repeating an identical request returns the **same**
stored itinerary (cache hit) rather than a fresh LLM call.

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
| POST | `/api/v1/itineraries` | Generate an itinerary from preferences (201) |
| GET | `/api/v1/itineraries/{id}` | Retrieve a saved itinerary |
| GET | `/api/v1/itineraries?page=&per_page=` | Paginated list (excludes soft-deleted) |
| DELETE | `/api/v1/itineraries/{id}` | Soft-delete |
| POST | `/api/v1/preferences/validate` | Validate preferences without calling the LLM |
| GET | `/health` | Liveness + version |
| GET | `/docs` | Swagger UI |

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `LLM_PROVIDER` | `mock` | `openai` \| `mock` \| `langchain` (falls back to mock if no key) |
| `OPENAI_API_KEY` | — | Required for the OpenAI/LangChain providers |
| `OPENAI_MODEL` | `gpt-4o-mini` | Chat model |
| `MAX_TOKENS` | `2000` | Per-completion token cap (cost control) |
| `DATABASE_URL` | `sqlite+aiosqlite:///./tai.db` | Async DB URL (Postgres-ready) |
| `CACHE_BACKEND` | `memory` | `memory` \| `redis` (Redis falls back to in-memory) |
| `REDIS_URL` | `redis://localhost:6379/0` | Used when `CACHE_BACKEND=redis` |
| `RATE_LIMIT_ENABLED` | `true` | Toggle per-IP rate limiting |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated CORS origins |
| `DEBUG_MODE` | `false` | Exposes `/api/v1/debug/token-stats` |
| `LOG_LEVEL` | `INFO` | Logging verbosity |

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
network — so it's fast and deterministic in CI. Coverage spans the cache-hit identity
guarantee, rate-limit isolation (429), error mapping (503/502), request validation,
destination discovery, affiliate-link generation (plain vs. tagged), the Unsplash image
proxy (fallback + payload parsing), and a concurrency smoke test that fires many
simultaneous requests and asserts they all succeed.

## Development

```bash
.venv/bin/pytest -q                 # full test suite (mock provider, no network)
.venv/bin/ruff check api/ tests/    # lint
cd web && npm run build             # type-check + production build
```

## License

[MIT](LICENSE) © William Mar
