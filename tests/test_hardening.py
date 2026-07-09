"""BE-HARDEN tests: security headers, request-id, readiness, logging, limits.

All tests run network-free against the mock-provider ``client`` fixture from
``conftest.py`` (rate limiting disabled there). The rate-limit-header test
builds its own app with limiting enabled, mirroring ``test_rate_limit.py``, and
resets the shared limiter in teardown so it cannot poison other tests.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from api.config import Settings
from api.db import Base, get_session
from api.logging_config import JsonLogFormatter, request_id_var, setup_logging
from api.main import create_app
from api.ratelimit import limiter


# ── Security headers ────────────────────────────────────────────────────────
async def test_security_headers_present(client) -> None:
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.headers["X-Content-Type-Options"] == "nosniff"
    assert resp.headers["X-Frame-Options"] == "DENY"
    assert resp.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "max-age=" in resp.headers["Strict-Transport-Security"]
    csp = resp.headers["Content-Security-Policy"]
    assert "default-src 'self'" in csp
    # CSP must not break Swagger UI (loads from jsdelivr) or the SPA.
    assert "cdn.jsdelivr.net" in csp


async def test_docs_still_loads(client) -> None:
    """The hardened CSP must keep the Swagger UI reachable."""
    resp = await client.get("/docs")
    assert resp.status_code == 200
    assert "swagger-ui" in resp.text.lower()
    # OpenAPI schema is also reachable.
    schema = await client.get("/openapi.json")
    assert schema.status_code == 200


# ── Request ID ──────────────────────────────────────────────────────────────
async def test_request_id_generated_when_absent(client) -> None:
    resp = await client.get("/health")
    assert resp.headers.get("X-Request-ID")
    # uuid4().hex is 32 hex chars.
    assert len(resp.headers["X-Request-ID"]) == 32


async def test_request_id_echoed_when_supplied(client) -> None:
    resp = await client.get("/health", headers={"X-Request-ID": "abc-123"})
    assert resp.headers["X-Request-ID"] == "abc-123"


# ── Readiness probe ─────────────────────────────────────────────────────────
async def test_ready_ok(client) -> None:
    resp = await client.get("/ready")
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"status": "ready", "db": "ok", "cache": "ok"}


async def test_ready_db_failure_returns_503(app) -> None:
    """When the DB session raises, /ready reports 503 and db=unreachable."""

    class _BrokenSession:
        async def __aenter__(self):
            raise RuntimeError("db down")

        async def __aexit__(self, *exc) -> bool:
            return False

    def _broken_sessionmaker() -> _BrokenSession:
        return _BrokenSession()

    app.state.sessionmaker = _broken_sessionmaker

    async with LifespanManager(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/ready")

    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "not_ready"
    assert body["db"] == "unreachable"
    assert body["cache"] == "ok"


async def test_health_has_no_dependencies(client) -> None:
    """/health stays a pure liveness probe regardless of dependency state."""
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


# ── Static asset caching ────────────────────────────────────────────────────
async def test_hashed_asset_served_immutable(client) -> None:
    """Hashed Vite assets carry a long-lived immutable Cache-Control.

    Skipped when the frontend has not been built (no ``web/dist``) — the SPA
    mount only registers when the dist directory exists, so this caching
    invariant is only meaningful after ``npm run build``. CI's ``backend`` job
    runs Python-only (no Node build step), so the guard keeps it green there
    while the assertion still runs locally and in the Docker image.
    """
    from api.main import _WEB_DIST

    assets = list((_WEB_DIST / "assets").glob("*.js")) if _WEB_DIST.is_dir() else []
    if not assets:
        pytest.skip("frontend not built (no web/dist/assets) — build to exercise")
    resp = await client.get(f"/assets/{assets[0].name}")
    assert resp.status_code == 200
    assert resp.headers["Cache-Control"] == "public, max-age=31536000, immutable"


async def test_index_html_not_cached(client) -> None:
    """The SPA entrypoint must never be aggressively cached.

    Skipped without a built ``web/dist`` (see ``test_hashed_asset_served_immutable``):
    the ``/`` route only serves ``index.html`` when the SPA mount is registered.
    """
    from api.main import _WEB_DIST

    if not _WEB_DIST.is_dir():
        pytest.skip("frontend not built (no web/dist) — build to exercise")
    resp = await client.get("/")
    assert resp.status_code == 200
    assert "immutable" not in resp.headers.get("Cache-Control", "")
    assert resp.headers["Cache-Control"] == "no-cache"


# ── Structured JSON logging ─────────────────────────────────────────────────
def test_json_formatter_includes_request_id() -> None:
    formatter = JsonLogFormatter()
    record = logging.LogRecord(
        name="tai.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="hello %s",
        args=("world",),
        exc_info=None,
    )
    token = request_id_var.set("rid-42")
    try:
        rendered = formatter.format(record)
    finally:
        request_id_var.reset(token)

    payload = json.loads(rendered)
    assert payload["message"] == "hello world"
    assert payload["level"] == "INFO"
    assert payload["logger"] == "tai.test"
    assert payload["request_id"] == "rid-42"
    assert "timestamp" in payload


def test_json_formatter_omits_request_id_when_unset() -> None:
    formatter = JsonLogFormatter()
    record = logging.LogRecord(
        name="tai.test",
        level=logging.WARNING,
        pathname=__file__,
        lineno=1,
        msg="no rid",
        args=(),
        exc_info=None,
    )
    payload = json.loads(formatter.format(record))
    assert "request_id" not in payload


def test_setup_logging_is_idempotent() -> None:
    root = logging.getLogger()
    original_handlers = list(root.handlers)
    original_level = root.level
    try:
        setup_logging()
        setup_logging()
        assert len(root.handlers) == 1
        assert isinstance(root.handlers[0].formatter, JsonLogFormatter)
    finally:
        # Restore the pre-test logging config so other tests are unaffected.
        for handler in list(root.handlers):
            root.removeHandler(handler)
        for handler in original_handlers:
            root.addHandler(handler)
        root.setLevel(original_level)


# ── Rate-limit headers ──────────────────────────────────────────────────────
def _payload() -> dict:
    return {
        "destination": "Tokyo, Japan",
        "start_date": "2026-07-01",
        "end_date": "2026-07-03",
        "budget_usd": 1500.0,
        "interests": ["food"],
    }


@pytest.fixture
async def rate_limited_client() -> AsyncIterator[AsyncClient]:
    settings = Settings(
        LLM_PROVIDER="mock",
        OPENAI_API_KEY=None,
        RATE_LIMIT_ENABLED=True,
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        CACHE_BACKEND="memory",
    )
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    limiter.reset()

    app = create_app(settings)
    app.state.db_engine = engine
    app.state.sessionmaker = sessionmaker

    async def _override_get_session() -> AsyncIterator:
        async with sessionmaker() as session:
            yield session

    app.dependency_overrides[get_session] = _override_get_session

    try:
        async with LifespanManager(app):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                yield ac
    finally:
        limiter.reset()
        limiter.enabled = True
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()


async def test_rate_limit_headers_on_success(rate_limited_client) -> None:
    resp = await rate_limited_client.post("/api/v1/itineraries", json=_payload())
    assert resp.status_code == 201
    assert resp.headers["X-RateLimit-Limit"] == "10"
    # First request consumes one slot, leaving 9.
    assert resp.headers["X-RateLimit-Remaining"] == "9"
    assert int(resp.headers["X-RateLimit-Reset"]) >= 0


async def test_rate_limit_headers_on_throttle(rate_limited_client) -> None:
    for _ in range(10):
        await rate_limited_client.post("/api/v1/itineraries", json=_payload())
    resp = await rate_limited_client.post("/api/v1/itineraries", json=_payload())
    assert resp.status_code == 429
    assert resp.headers["X-RateLimit-Limit"] == "10"
    assert resp.headers["X-RateLimit-Remaining"] == "0"
    # The 429 handler still owns Retry-After.
    assert resp.headers["Retry-After"] == "60"
