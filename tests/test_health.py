"""Health endpoint tests."""

from __future__ import annotations

import asyncio

import pytest

from api.config import Settings


async def test_health_ok(client) -> None:
    resp = await client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"status": "ok", "version": "1.1.0"}


async def test_ready_ok(client) -> None:
    resp = await client.get("/ready")
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"status": "ready", "db": "ok", "cache": "ok"}


@pytest.fixture
def test_settings() -> Settings:
    """Override conftest settings with a sub-second readiness timeout so a hung
    probe trips ``asyncio.timeout`` quickly instead of stalling the test run."""
    return Settings(
        LLM_PROVIDER="mock",
        OPENAI_API_KEY=None,
        RATE_LIMIT_ENABLED=False,
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        CACHE_BACKEND="memory",
        DEBUG_MODE=False,
        HEALTH_CHECK_TIMEOUT_SECONDS=0.05,
    )


async def test_ready_db_timeout_reports_not_ready(app, client, monkeypatch) -> None:
    """A DB check that hangs past the timeout yields 503 not-ready, not a hang.

    We make the *session* hang inside the real ``_check_db`` (rather than stub
    the function out) so the assertion exercises the ``asyncio.timeout`` guard.
    """

    class _HangingSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc) -> None:
            return None

        async def execute(self, *_args, **_kwargs):
            await asyncio.sleep(5)

    monkeypatch.setattr(app.state, "sessionmaker", lambda: _HangingSession())

    # The outer ``wait_for`` guards the test itself: if the timeout regressed and
    # ``/ready`` hung, this fails fast rather than blocking the suite.
    resp = await asyncio.wait_for(client.get("/ready"), timeout=2)

    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "not_ready"
    assert body["db"] == "unreachable"


async def test_ready_cache_timeout_reports_not_ready(app, client, monkeypatch) -> None:
    """A cache backend that hangs past the timeout yields 503 not-ready."""

    async def _slow_get(_key: str):
        await asyncio.sleep(5)
        return None

    # Patch the live cache backend so the real ``_check_cache`` timeout fires.
    monkeypatch.setattr(app.state.cache, "get", _slow_get)

    resp = await asyncio.wait_for(client.get("/ready"), timeout=2)

    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "not_ready"
    assert body["cache"] == "unreachable"
