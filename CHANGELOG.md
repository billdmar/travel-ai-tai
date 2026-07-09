# Changelog

All notable changes to **Travel AI (TAI)** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project aims to honor
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

🔗 **Live demo:** https://travel-ai-tai.onrender.com — runs in deterministic mock‑LLM mode (no API key),
so the demo is reproducible without a paid provider.

---

## [1.1.0] — 2026-07-08

Second release: production polish, provider expansion, and frontend refinements.

### Added
- **Anthropic/Claude LLM provider** — completes support for all three major LLM APIs
  (OpenAI, Google Gemini, Anthropic Claude). Same retry/fallback/mock-degradation pattern.
- **Dark mode** with CSS-variable theming: system/light/dark toggle, persisted to localStorage.
- **GZip response compression** (Starlette middleware, 1 KB threshold).
- **CI security scanning** job: `pip-audit` for dependency CVEs + `bandit` for static analysis.
- **GitHub Actions keep-alive cron** — pings `/health` every 14 minutes to prevent
  Render free-tier cold starts (~22 s → instant).
- **404 Not Found page** — branded error state for unmatched URLs.
- **Scroll-to-top + focus management** on route change (WCAG 2.4.3 compliance).
- **PWA install prompt** — custom banner surfaces the browser's Add-to-Home-Screen flow.
- **OpenAPI request/response examples** — `/docs` Swagger UI prefilled for Try It Out.
- **Property-based testing** with Hypothesis for model validation edge cases.
- **ETag / conditional GET** on itinerary endpoints (returns 304 on cache hit).

### Changed
- TypeScript **strict mode** enabled across both tsconfig files (zero errors).
- Extracted generic `AsyncTTLCache[T]` from duplicated patterns in OG + image routes.
- Optional dependencies (`openai`, `redis`, `sentry-sdk`) split to `requirements-optional.txt`.
- Full-package **mypy** coverage in CI (was scoped to models + LLM only).
- Architecture docs, README test counts, and component references updated.

### Fixed
- `httpx` image proxy: shared `AsyncClient` on `app.state` (was per-request TCP+TLS).
- `/ready` health checks run concurrently via `asyncio.gather` (halved worst-case latency).
- Hero carousel: inactive slides now `aria-hidden`; form errors announced with `role="alert"`.
- Results page persists recommendations to `sessionStorage` (survives refresh).

---

## [1.0.0] — 2026-06-25

First tagged release. A full‑stack, production‑deployed LLM travel‑itinerary generator
(FastAPI + async SQLAlchemy backend, React 19 + Vite + Tailwind + framer‑motion frontend),
with a pluggable LLM provider layer (mock / OpenAI / Gemini / LangChain), Postgres persistence,
and a polished, accessible, motion‑rich UI. Built and hardened across three improvement passes.

### Added — Features
- **Itinerary generation** from a multi‑step preference form (destination, dates, budget, pace,
  interests, travel style, dietary & accessibility needs), with **SSE token streaming** for a live
  generation experience.
- **Interactive Leaflet map** of the itinerary with a list/map toggle (lazy code‑split).
- **Trip regeneration** with adjusted preferences, and **client‑side itinerary editing**
  (reorder / remove activities, re‑normalized server‑side — no LLM round‑trip).
- **Exports & sharing:** Markdown, multi‑section premium **PDF**, **ICS** calendar, opaque‑token
  **share links**, and a **dynamic per‑itinerary OG image** (1200×630 PNG) for social previews.
- **Trip comparison** (2–3 saved trips side‑by‑side) and a **curated destinations** catalog
  (DB‑backed) with discovery recommendations.
- **Cost breakdown**, **packing checklist**, and a server‑side **Unsplash image proxy** with caching.
- **PWA offline support** (service worker: NetworkFirst itineraries, CacheFirst images).
- **Delight & motion:** animated DayCard accordion, save‑celebration confetti, time‑staged
  generation‑progress bar, destination‑image fade‑in over a skeleton, staggered cost bars and
  empty states, and a "Surprise me" random‑destination CTA — all reduced‑motion‑safe.

### Added — Production readiness
- **Alembic migrations** as the schema carrier (applied on startup for Postgres; `create_all` for dev),
  with a **Postgres CI job** running upgrade / downgrade / re‑upgrade against the prod dialect.
- **Observability:** structured JSON log context (path / method / client IP), opt‑in **Prometheus
  `/metrics`**, and opt‑in **Sentry** error tracking — all no‑ops unless explicitly enabled.
- **Operational hardening:** locked‑down CORS, rate limiting across mutating + read routes,
  security headers, request IDs, readiness‑probe timeouts, Docker graceful shutdown + HEALTHCHECK.
- **CI quality gates:** backend coverage gate (`--cov-fail-under=90`, ~94% actual), **blocking mypy**,
  frontend vitest coverage thresholds, ruff + eslint, and a production build check.

### Changed
- Migrated the Gemini provider from the EOL `google-generativeai` SDK to the supported `google-genai`.
- Real provider **token accounting** + an observable `X‑LLM‑Fallback` header when a provider silently
  degrades to the mock.
- Improved the deterministic **mock provider** (the live demo): real city GPS coordinates,
  destination‑aware tips, and budget/travel‑style‑scaled costs.
- **Performance:** vendor bundle code‑split, immutable hashed‑asset cache headers, lazy‑loaded map.

### Fixed
- Streaming error path now surfaces the real `503` / `502` code instead of a generic parse error.
- Closed a share‑token mint race (silent duplicate tokens) and a save‑itinerary lost‑update race.
- Share tokens are cleaned up / never served for soft‑deleted itineraries.
- ICS export folding for multi‑byte (emoji / CJK) titles; out‑of‑range map coordinates dropped.
- Stopped leaking Pydantic internals in 422 responses.

### Accessibility
- WCAG pass: skip‑to‑content link, slider `aria‑valuetext`, `fieldset`/`legend` grouping, semantic
  links, repaired form design tokens, and border‑contrast tokens meeting WCAG 1.4.11 (≥ 3:1).
- Comprehensive `prefers-reduced-motion` support — every animation has a static fallback.

### Documentation
- Senior‑level `README.md`, `web/README.md`, and `docs/ARCHITECTURE.md`; honest scope notes
  (the live demo runs the mock provider; "200+ users" is a design target, not a load test).

[1.0.0]: https://github.com/billdmar/travel-ai-tai/releases/tag/v1.0.0
