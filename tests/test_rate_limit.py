"""Isolated rate-limit test (PLAN adversarial-review #3).

This is the ONLY test that enables rate limiting. It builds a dedicated app
instance, fires 11 POSTs, asserts the 11th is 429, and resets the shared
module-level limiter state in teardown so it cannot poison other tests.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from api.config import Settings
from api.db import Base, get_session
from api.main import create_app
from api.ratelimit import limiter


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

    # Reset any limiter state leaked in from elsewhere before we start.
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
        # Critical: reset shared limiter so the 429 state does not poison
        # other tests, and restore the default enabled flag.
        limiter.reset()
        limiter.enabled = True
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()


async def test_eleventh_post_is_rate_limited(rate_limited_client) -> None:
    statuses = []
    for _ in range(11):
        resp = await rate_limited_client.post(
            "/api/v1/itineraries", json=_payload()
        )
        statuses.append(resp.status_code)

    # First 10 succeed (201 or cached), the 11th is throttled.
    assert statuses[:10] == [201] * 10
    assert statuses[10] == 429

    last = await rate_limited_client.post("/api/v1/itineraries", json=_payload())
    assert last.status_code == 429
    body = last.json()
    assert body["error"] == "rate_limit_exceeded"
    assert body["retry_after_seconds"] == 60
    assert last.headers.get("Retry-After") == "60"


async def test_shared_get_is_rate_limited(rate_limited_client) -> None:
    """The read limit (60/min) also throttles the public share GET."""
    created = (
        await rate_limited_client.post("/api/v1/itineraries", json=_payload())
    ).json()
    token = (
        await rate_limited_client.post(
            f"/api/v1/itineraries/{created['id']}/share"
        )
    ).json()["token"]

    statuses = []
    for _ in range(61):
        resp = await rate_limited_client.get(f"/api/v1/shared/{token}")
        statuses.append(resp.status_code)

    # First 60 reads succeed; the 61st is throttled with a Retry-After.
    assert statuses[:60] == [200] * 60
    assert statuses[60] == 429
    throttled = await rate_limited_client.get(f"/api/v1/shared/{token}")
    assert throttled.status_code == 429
    assert throttled.json()["error"] == "rate_limit_exceeded"
    assert throttled.headers.get("Retry-After") == "60"
