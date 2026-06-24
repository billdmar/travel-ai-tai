"""Tests for the server-side Unsplash image proxy.

Covers :func:`api.routes.images.get_image`:

* with no access key configured the endpoint returns ``fallback: true`` with
  null URLs and never calls out,
* with a key it parses a (mocked) Unsplash payload into the public envelope,
* any upstream failure degrades gracefully to the fallback envelope.

Unsplash is mocked via httpx's built-in ``MockTransport`` (no ``respx``
dependency), injected by monkeypatching ``httpx.AsyncClient`` in the route.
"""

from __future__ import annotations

import httpx
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from api.config import Settings
from api.db import get_session
from api.main import create_app


def _settings(**overrides) -> Settings:
    base = {
        "LLM_PROVIDER": "mock",
        "RATE_LIMIT_ENABLED": False,
        "DATABASE_URL": "sqlite+aiosqlite:///:memory:",
        "CACHE_BACKEND": "memory",
    }
    base.update(overrides)
    return Settings(**base)


def _app(settings: Settings, sessionmaker):
    """Build an app on the shared test DB (mirrors conftest's ``app``)."""
    application = create_app(settings)
    application.state.sessionmaker = sessionmaker

    async def _override_get_session():
        async with sessionmaker() as session:
            yield session

    application.dependency_overrides[get_session] = _override_get_session
    return application


async def _client(app):
    async with LifespanManager(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac


_UNSPLASH_PAYLOAD = {
    "results": [
        {
            "urls": {
                "regular": "https://images.unsplash.com/photo-1?w=1080",
                "thumb": "https://images.unsplash.com/photo-1?w=200",
            },
            "alt_description": "tokyo skyline at dusk",
            "user": {
                "name": "Jane Doe",
                "links": {"html": "https://unsplash.com/@janedoe"},
            },
        }
    ]
}


def _install_mock_transport(monkeypatch, handler) -> None:
    """Replace ``httpx.AsyncClient`` so the route talks to a MockTransport."""
    real_async_client = httpx.AsyncClient

    def _factory(*args, **kwargs):
        kwargs.pop("timeout", None)
        return real_async_client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", _factory)


async def test_no_key_returns_fallback(engine, sessionmaker) -> None:
    app = _app(_settings(UNSPLASH_ACCESS_KEY=None), sessionmaker)
    async for client in _client(app):
        resp = await client.get("/api/v1/images", params={"query": "Tokyo"})
    assert resp.status_code == 200
    body = resp.json()
    assert body == {
        "url": None,
        "thumb_url": None,
        "alt": "Tokyo",
        "credit": None,
        "fallback": True,
    }


async def test_parses_unsplash_payload(monkeypatch, engine, sessionmaker) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Client-ID test-key"
        return httpx.Response(200, json=_UNSPLASH_PAYLOAD)

    _install_mock_transport(monkeypatch, handler)
    app = _app(_settings(UNSPLASH_ACCESS_KEY="test-key"), sessionmaker)
    async for client in _client(app):
        resp = await client.get("/api/v1/images", params={"query": "Tokyo"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["fallback"] is False
    assert body["url"] == "https://images.unsplash.com/photo-1?w=1080"
    assert body["thumb_url"] == "https://images.unsplash.com/photo-1?w=200"
    assert body["alt"] == "tokyo skyline at dusk"
    assert body["credit"] == {
        "name": "Jane Doe",
        "link": "https://unsplash.com/@janedoe",
    }


async def test_empty_results_returns_fallback(
    monkeypatch, engine, sessionmaker
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"results": []})

    _install_mock_transport(monkeypatch, handler)
    app = _app(_settings(UNSPLASH_ACCESS_KEY="test-key"), sessionmaker)
    async for client in _client(app):
        resp = await client.get("/api/v1/images", params={"query": "Nowhere"})

    assert resp.status_code == 200
    assert resp.json()["fallback"] is True


async def test_upstream_error_returns_fallback(
    monkeypatch, engine, sessionmaker
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    _install_mock_transport(monkeypatch, handler)
    app = _app(_settings(UNSPLASH_ACCESS_KEY="test-key"), sessionmaker)
    async for client in _client(app):
        resp = await client.get("/api/v1/images", params={"query": "Tokyo"})

    # Never raises to the client; degrades to the fallback envelope.
    assert resp.status_code == 200
    assert resp.json()["fallback"] is True


async def test_network_error_returns_fallback(
    monkeypatch, engine, sessionmaker
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no network")

    _install_mock_transport(monkeypatch, handler)
    app = _app(_settings(UNSPLASH_ACCESS_KEY="test-key"), sessionmaker)
    async for client in _client(app):
        resp = await client.get("/api/v1/images", params={"query": "Tokyo"})

    assert resp.status_code == 200
    assert resp.json()["fallback"] is True


async def test_missing_query_is_422(engine, sessionmaker) -> None:
    app = _app(_settings(UNSPLASH_ACCESS_KEY="test-key"), sessionmaker)
    async for client in _client(app):
        resp = await client.get("/api/v1/images")
    assert resp.status_code == 422


async def test_skips_candidate_without_regular_url(
    monkeypatch, engine, sessionmaker
) -> None:
    """A first result missing a ``regular`` URL is skipped for a usable one."""
    payload = {
        "results": [
            {"urls": {"thumb": "https://images.unsplash.com/x?w=200"}},  # no regular
            {
                "urls": {
                    "regular": "https://images.unsplash.com/photo-2?w=1080",
                    "thumb": "https://images.unsplash.com/photo-2?w=200",
                },
                "alt_description": "kyoto bamboo grove",
                "user": {
                    "name": "Aki",
                    "links": {"html": "https://unsplash.com/@aki"},
                },
            },
        ]
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    _install_mock_transport(monkeypatch, handler)
    app = _app(_settings(UNSPLASH_ACCESS_KEY="test-key"), sessionmaker)
    async for client in _client(app):
        resp = await client.get("/api/v1/images", params={"query": "Kyoto"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["fallback"] is False
    assert body["url"] == "https://images.unsplash.com/photo-2?w=1080"
    assert body["alt"] == "kyoto bamboo grove"


async def test_no_usable_candidate_returns_fallback(
    monkeypatch, engine, sessionmaker
) -> None:
    """Results that all lack a ``regular`` URL degrade to the fallback."""
    payload = {"results": [{"urls": {"thumb": "t"}}, {"not": "a photo"}]}

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    _install_mock_transport(monkeypatch, handler)
    app = _app(_settings(UNSPLASH_ACCESS_KEY="test-key"), sessionmaker)
    async for client in _client(app):
        resp = await client.get("/api/v1/images", params={"query": "Nowhere"})

    assert resp.status_code == 200
    assert resp.json()["fallback"] is True


async def test_long_query_is_capped_upstream(
    monkeypatch, engine, sessionmaker
) -> None:
    """Oversized queries are trimmed before hitting Unsplash (defensive cap)."""
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["query"] = request.url.params.get("query", "")
        return httpx.Response(200, json=_UNSPLASH_PAYLOAD)

    _install_mock_transport(monkeypatch, handler)
    app = _app(_settings(UNSPLASH_ACCESS_KEY="test-key"), sessionmaker)
    long_query = "Tokyo " + "x" * 500
    async for client in _client(app):
        resp = await client.get("/api/v1/images", params={"query": long_query})

    assert resp.status_code == 200
    # Upstream query is capped well below the raw input length.
    assert len(seen["query"]) <= 120
    # But the public alt still reflects the caller's original query intent.
    assert resp.json()["fallback"] is False
