# PLAN — Travel AI (TAI)

Ground-truth plan (Trilogy "Perfect Plan" method). If context compacts, **re-read this
file** rather than trusting the conversation summary. Progress is appended to
`docs/progress.md` after each bead closes.

## Context
Build the "Travel AI (TAI)" full-stack LLM itinerary generator from William Mar's resume
(Co-Creator, UT Austin ECE) — no repo exists yet. FastAPI async backend + OpenAI gpt-4o-mini
(JSON-mode, Pydantic-validated) + React/Vite/TS/Tailwind frontend, containerized, tested.
Goal: clean, well-factored, recruiter-grade code. Primary spec:
`~/Downloads/claude-code-project-prompts/04-travel-ai.md`.

## Environment facts (probed)
- Node v24, npm 11, uv 0.11, Python via uv. **No Docker** (compose verified by inspection only).
- **No OPENAI_API_KEY** → mock provider is the default; all tests + demo use it. This is by design.
- Apple Silicon, 301GB free.

---

## Insight tiers (Trilogy Step 7) — higher tier wins on conflict

**Tier 1 — plan fails without these:**
1. **Structured-output discipline.** LLM output is never trusted: every response goes through
   `ItineraryResponse.model_validate(...)` in try/except. Malformed JSON → 502, logged truncated.
2. **Mock provider is the spine.** Default when no key; fully satisfies the Pydantic schema;
   CI + tests + local demo all run on it. If the mock drifts from the schema, every test breaks.
3. **Secrets hygiene.** `.env` gitignored and committed FIRST; `git diff --cached` checked for
   `OPENAI_API_KEY` before any `api/` commit. A leaked key = repo-burning (cf. SafeWalk incident).
4. **Provider abstraction is the seam.** `get_provider()` factory + abstract base; openai/mock/
   langchain are interchangeable. Engine code never imports a concrete provider.

**Tier 2 — significantly affects quality:**
5. Async all the way (route handlers, SQLAlchemy session) — the "scalable" claim's substance.
6. Cache key = SHA-256 of canonical preference JSON; identical prefs → same itinerary id (TTL).
7. Rate limiting (slowapi, 10/min/IP on POST) + tenacity retry/backoff on the OpenAI path.
8. Polished OpenAPI (/docs) — title/description/version/contact + handler docstrings.

**Tier 3 — incremental:**
9. LangChain provider (resume skills tag) — optional, env-gated, NOT default.
10. Redis cache backend — optional, graceful fallback to in-memory.
11. Alembic migration — nice for "Postgres-ready" story; SQLite default.

**Does not apply / explicitly excluded:**
- A real 200-user load test is NOT required (claim is design-for-scale; optional bead B-LOAD).
- Real OpenAI API calls in CI — forbidden (cost + no key); mock only.

---

## Bead graph (Trilogy Step 4) — each blocks the next; `done when` is measurable

### Phase 0.5 — Feasibility spike (adversarial-review addition; do FIRST)
- **B-SPIKE** | P0 | blocked by: none
  What: stand up `api/models.py` + `api/llm/mock_provider.py` minimally; assert the mock JSON
  validates against `ItineraryResponse`, and date math / cost totals are coherent.
  Done when: a throwaway script validates mock output against the real Pydantic schema, exit 0.
  If it fails: see Scenario F1 (schema/mock mismatch) — fix the contract before building anything else.

### Phase 1 — Backend scaffold + models
- **B1-CFG** | P0 | blocked by: B-SPIKE
  What: repo dirs, `requirements*.txt`, `.gitignore` (committed first), `.env.example`,
  `api/config.py` (pydantic-settings), `api/main.py` (app + CORS + lifespan).
  Done when: `uvicorn api.main:app` boots; `GET /health` → `{"status":"ok","version":"1.0.0"}` 200; ruff clean.
  If it fails: Scenario F5 (dependency/version).
- **B1-MODELS** | P0 | blocked by: B-SPIKE
  What: all Pydantic models + validators (date range, trip 1–30 days, string/list caps).
  Done when: import succeeds; validators reject bad input (trip>30 → ValidationError) in a quick check.

### Phase 2 — LLM provider layer
- **B2-PROVIDER** | P0 | blocked by: B1-MODELS
  What: abstract `LLMProvider`, `get_provider()` factory, mock + openai + langchain providers,
  `prompts/itinerary.py` (system+user builders with embedded JSON schema).
  Done when: `get_provider()` returns mock w/o key; mock `complete()` output validates; openai
  retry path unit-tested via mocked RateLimitError×2→success.
  If it fails: Scenario F2 (provider/JSON), F6 (retry).

### Phase 3 — Recommendation engine + routes
- **B3-ENGINE** | P0 | blocked by: B2-PROVIDER
  What: `recommend.py::RecommendationEngine.generate`, cache-key derivation, route handlers
  for POST /itineraries + POST /preferences/validate; error mapping (503/502/422).
  Done when: POST valid+mock → 201 full ItineraryResponse; bad dates → 422; validate → {"valid":true}
  w/o LLM; identical prefs → identical id (cache hit).

### Phase 4 — Persistence + cache + rate limit
- **B4-DB** | P0 | blocked by: B3-ENGINE
  What: async SQLAlchemy engine/session + `ItineraryRecord` ORM; cache.py (TTL + optional Redis);
  GET by id, paginated list, soft-delete; slowapi 10/min on POST; Alembic initial migration.
  Done when: itinerary survives restart (GET by id); 11th POST/60s → 429; list returns
  `{page,per_page,total,items}`; `alembic upgrade head` exits 0.
  If it fails: Scenario F7 (DB/migration).

### Phase 5 — Frontend (parallelizable with Phase 4 once models+routes exist)
- **B5-WEB** | P1 | blocked by: B3-ENGINE
  What: Vite+React+TS+Tailwind; 4-step PreferenceForm, ItineraryView, DayCard, LoadingSkeleton,
  SavedItinerariesPage, typed api client, vite proxy /api→:8000, error banners (422/429/503/network).
  Done when: `npm run build` 0 TS errors; `npm run dev` serves :5173; form→POST→itinerary renders (mock).
  If it fails: Scenario F8 (frontend build/proxy).

### Phase 6 — Tests, Docker, docs, CI, ship
- **B6-TEST** | P0 | blocked by: B4-DB
  What: pytest suite (health, itineraries, mock_provider, recommend, models) via httpx ASGITransport,
  in-memory SQLite, forced mock; target meaningful coverage.
  Done when: `pytest -q` 0 fail / 0 error, no network, no missing-env warnings.
- **B6-DOCKER** | P2 | blocked by: B5-WEB, B4-DB
  What: multi-stage Dockerfile (node build → python serve, static mount), docker-compose (api+redis).
  Done when: Dockerfile + compose lint/parse cleanly (build not runnable here — no Docker; documented).
- **B6-DOCS** | P1 | blocked by: B6-TEST
  What: README (overview, features, ASCII arch, quickstart local+docker, env table, API table,
  **Scalability Design** ≥4 mechanisms, dev/test, license), MIT LICENSE.
  Done when: all DoD doc items present; scalability section has ≥4 concrete mechanisms; honest 200-user framing.
- **B6-CI** | P0 | blocked by: B6-TEST, B5-WEB
  What: GitHub Actions — backend (ruff+pytest) + frontend (npm build) jobs; no key needed.
  Done when: valid YAML; mirrors local pass; goes green after push.
- **B6-SHIP** | P0 | blocked by: B6-DOCS, B6-CI, B6-DOCKER
  What: logical commits (secrets check each time), `gh repo create travel-ai-tai --public`, 9 topics, push.
  Done when: public repo live, topics set, CI green; `.env` NOT tracked (verified).

### Parallel map
- B1-CFG ∥ B1-MODELS (after B-SPIKE). B5-WEB ∥ B4-DB (after B3-ENGINE). B6-DOCS ∥ B6-CI prep.

---

## Decision gates (Trilogy Step 5) — Pass / Adjust / Abort

| Gate | After | Pass | Adjust | Abort |
|------|-------|------|--------|-------|
| G0 Feasibility | B-SPIKE | mock validates vs schema | tweak model/mock to agree | schema unworkable → rethink models |
| G1 Backend core | B3-ENGINE | 201 mock itinerary + cache hit + 422 | fix mapping/cache | engine contract broken → revisit B2 |
| G2 Persistence | B4-DB | restart-survive + 429 + paginate | adjust pool/limit | async DB infeasible → sync fallback (documented) |
| G3 Frontend | B5-WEB | build 0 errors + form→render | fix proxy/types | — (frontend non-blocking for backend ship) |
| G4 Ship-ready | B6-TEST+CI | pytest 0-fail + ruff + CI green + no .env tracked | fix failing gate | secret leaked → STOP, rotate, scrub |

---

## Failure scenarios (Trilogy Step 6) — named, with numbered recovery cascades

- **F1 Mock/schema mismatch** — detect: validate script raises ValidationError.
  1) align mock JSON to model; 2) if model wrong, fix validator; 3) snapshot-test mock vs schema so it can't drift.
- **F2 LLM returns non-JSON / bad shape** — detect: `model_validate` raises.
  1) enforce `response_format={"type":"json_object"}`; 2) embed schema verbatim in system prompt;
  3) log raw truncated 500 chars → 502; 4) (real key only) one reformat-retry.
- **F5 Dependency/version conflict** (e.g. pydantic v1/v2, sqlalchemy 1.x/2.x) — detect: import/boot error.
  1) pin majors in requirements; 2) use pydantic v2 + sqlalchemy 2 async APIs; 3) `uv pip` resolve, lock.
- **F6 OpenAI rate limit/timeout** — detect: RateLimitError/APITimeoutError.
  1) tenacity 3× exp backoff; 2) exhausted → LLMUnavailableError → 503 + Retry-After:60; 3) suggest mock.
- **F7 DB / migration failure** — detect: `alembic upgrade` nonzero or session error.
  1) verify async URL (sqlite+aiosqlite); 2) create_all fallback if alembic env misconfig; 3) document Postgres swap.
- **F8 Frontend build/proxy** — detect: tsc errors or dev fetch 404.
  1) fix vite `server.proxy`; 2) align TS types to Pydantic; 3) Tailwind/PostCSS config check.
- **F-SECRET Leaked key** — detect: `git diff --cached` shows OPENAI_API_KEY.
  1) unstage; 2) ensure .env gitignored; 3) if already pushed → rotate key + filter-repo scrub (cf. SafeWalk).

---

## Adversarial review resolutions (Trilogy Step 8) — 13 adopted, 2 folded

**Blockers (all adopted):**
- **#1 LLM schema split.** The LLM returns a `GeneratedItinerary` model (days, total_estimated_cost_usd,
  currency, summary, tips) — NO `id`/`created_at`/`preferences`/`provider`/`tokens_used`. The engine
  attaches server-owned fields to build the full `ItineraryResponse`. The cache-hit "same id" property
  comes from the engine returning the **stored DB row** for a repeated cache key, not from the LLM
  emitting a stable id. B-SPIKE validates the LLM-facing sub-schema. → fixes F1 + the cache-identity test.
- **#2 In-memory SQLite needs StaticPool.** Test engine: `create_async_engine("sqlite+aiosqlite:///:memory:",
  connect_args={"check_same_thread": False}, poolclass=StaticPool)` + `Base.metadata.create_all` in an
  autouse async fixture (NOT Alembic). "Survives restart" uses a temp **file** DB (dispose engine, reopen, read).
- **#3 Rate-limit test isolation.** Add `RATE_LIMIT_ENABLED` setting (default true; tests set false except
  the one 429 test). slowapi handler must take `request: Request` as first param. The dedicated test loops
  11 requests with a fixed key func and resets limiter state in teardown.
- **#4 Static-mount precedence.** Register `/health`, `/api/v1/*`, and FastAPI's `/docs`+`/openapi.json`
  FIRST; mount StaticFiles at `/` LAST; add a catch-all `GET /{full_path:path}` returning `index.html`
  for non-`/api` paths (SPA routing). Add a test asserting `/health` + `/api/v1/*` still resolve.

**Majors (adopted):**
- **#5 Split B4 + pull cache forward.** B4 → B4a-DB (engine/session/ORM + GET-by-id + restart),
  B4b-LIST (paginated list + soft-delete), B4d-RATELIMIT (slowapi + 429 test), B4e-MIGRATION (Alembic).
  Cache moves into **B3-ENGINE** (a minimal in-memory TTL cache is required by B3's cache-hit DoD); Redis
  fallback stays optional in B4c.
- **#6 Concrete version pins + lock FIRST.** See "Pinned versions" below; B1-CFG's first action is
  `uv pip compile` to prove resolution. langchain-openai → separate `requirements-langchain.txt` (Tier 3,
  must not break core resolve/CI). Cache key = `hashlib.sha256(json.dumps(prefs.model_dump(mode="json"),
  sort_keys=True, separators=(",",":")).encode()).hexdigest()` (NOT the nonexistent `model_dump_json(sort_keys=)`).
- **#7 Async test harness.** App uses a `create_app(settings)` factory + `get_session` dependency (no
  module-global engine), so tests inject via `app.dependency_overrides`. conftest: function-scoped engine
  (StaticPool), autouse create_all/drop_all, `ASGITransport(app=app)` under `async with`, `asgi-lifespan`
  if lifespan does DB init. `pytest-asyncio` `asyncio_mode="auto"` + explicit loop scope (kills the warning).
- **#8 mypy scoped, non-blocking.** Run `mypy api/models.py api/llm/` only, as a non-blocking CI step
  (full async-SQLAlchemy mypy is an open-ended sink). Honesty-ledger claim updated accordingly.
- **#9 CORS bead.** B1-CFG done-when: parse `ALLOWED_ORIGINS` (csv→list), wire `CORSMiddleware`, default
  `http://localhost:5173`. Note prod single-container is same-origin (no CORS needed) — interview point.
- **#10 Verifiability matrix** (below): each DoD item marked executed / inspection-only / verified-via-proxy.

**Minors:** #11 concurrency smoke test → promoted into B6-TEST (gather 50 mock POSTs, assert all 201).
#12 keep literal "JSON" in system prompt (guard comment). #13 soft-delete: list filters `deleted_at IS NULL`,
GET of deleted → 404. #14 `/debug/token-stats` → included in B3 (~10 lines, DEBUG-gated). #15 version = `1.0.0`
everywhere, driven by `settings.version`.

**Folded (not separate work):** the review's "split B5-WEB further" — kept whole but build verified by
`npm run build` + a component smoke; and "separate failure-taxonomy" — already covered by F1–F8 here.

## Pinned versions (prove via `uv pip compile` before feature code)
`fastapi>=0.110,<0.116` · `pydantic>=2.7,<3` · `pydantic-settings>=2.2,<3` · `sqlalchemy>=2.0,<2.1`
(async via `async_sessionmaker`) · `aiosqlite` · `httpx>=0.27,<0.29` (use `ASGITransport`) ·
`pytest-asyncio>=0.23,<0.25` (`asyncio_mode=auto`) · `slowapi` pinned with fastapi · `openai>=1.0,<2` ·
`tenacity` · `cachetools` · `alembic` · `asgi-lifespan` (dev). langchain-openai → optional extra file.

## Verifiability matrix (Trilogy Step 10 honesty)
| DoD item | How verified here |
|----------|-------------------|
| pytest 0-fail, ruff clean | **executed** |
| /health, /docs, all routes resolve w/ static mount | **executed** (httpx integration test) |
| form→itinerary render | **verified-via-proxy**: `npm run build` 0 errors + component smoke + httpx POST test (no live browser) |
| docker-compose up | **inspection-only** (no Docker in env) — Dockerfile/compose parse-checked |
| real OpenAI call | **inspection-only / unit-mocked** (no API key) — retry path tested via mocked errors |
| 200+ users | **design target + concurrency smoke** (50 concurrent mock POSTs), NOT a real load test |

## Compaction-survival protocol (Trilogy Step 9)
- This file = ground truth. `docs/progress.md` = append-only bead log.
- State the current bead at the start of each major action.
- Heavy work (frontend build, large test runs) → subagents returning short summaries; bulk output never floods main context.
- Commit before/after each phase so the filesystem (not the chat) is the source of truth.
