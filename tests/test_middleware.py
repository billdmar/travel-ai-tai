"""Unit tests for the ASGI middleware in :mod:`api.middleware`.

These exercise ``RequestIDMiddleware`` and ``SecurityHeadersMiddleware`` in
isolation by mounting them on a tiny Starlette app, so the assertions target the
middleware behaviour directly rather than the assembled production app (which
``tests/test_hardening.py`` already covers end-to-end). All tests are network
free and run against an in-process ASGI transport.
"""

from __future__ import annotations

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, PlainTextResponse
from starlette.routing import Route

from api.logging_config import request_id_var
from api.middleware import (
    _SECURITY_HEADERS,
    RequestIDMiddleware,
    SecurityHeadersMiddleware,
)


def _build_app(*middleware_classes: type, route_handler=None) -> Starlette:
    """A minimal Starlette app with a single GET route and given middleware."""

    async def _ok(_request: Request) -> PlainTextResponse:
        return PlainTextResponse("ok")

    app = Starlette(routes=[Route("/probe", route_handler or _ok)])
    for cls in middleware_classes:
        app.add_middleware(cls)
    return app


@pytest.fixture
async def client_factory():
    """Yield a factory that wraps an app in a lifespan-managed AsyncClient."""
    managers: list[LifespanManager] = []
    clients: list[AsyncClient] = []

    async def _make(app: Starlette) -> AsyncClient:
        manager = await LifespanManager(app).__aenter__()
        managers.append(manager)
        transport = ASGITransport(app=app)
        ac = AsyncClient(transport=transport, base_url="http://test")
        await ac.__aenter__()
        clients.append(ac)
        return ac

    yield _make

    for ac in clients:
        await ac.__aexit__(None, None, None)
    for manager in managers:
        await manager.__aexit__(None, None, None)


# ── SecurityHeadersMiddleware ─────────────────────────────────────────────────
async def test_security_headers_added_to_response(client_factory) -> None:
    app = _build_app(SecurityHeadersMiddleware)
    client = await client_factory(app)

    resp = await client.get("/probe")

    assert resp.status_code == 200
    # Every configured hardening header lands on the response verbatim.
    for header, value in _SECURITY_HEADERS.items():
        assert resp.headers[header] == value


async def test_security_headers_use_setdefault(client_factory) -> None:
    """A header already set by the handler is preserved, not overwritten."""

    async def _custom(_request: Request) -> PlainTextResponse:
        return PlainTextResponse(
            "ok", headers={"X-Frame-Options": "SAMEORIGIN"}
        )

    app = _build_app(SecurityHeadersMiddleware, route_handler=_custom)
    client = await client_factory(app)

    resp = await client.get("/probe")

    # setdefault means the handler's value wins; the rest are still added.
    assert resp.headers["X-Frame-Options"] == "SAMEORIGIN"
    assert resp.headers["X-Content-Type-Options"] == "nosniff"


async def test_rate_limit_headers_surfaced_from_request_state(client_factory) -> None:
    """Headers stashed on ``request.state.rate_limit_headers`` are emitted."""

    async def _with_rl(request: Request) -> PlainTextResponse:
        request.state.rate_limit_headers = {
            "X-RateLimit-Limit": "10",
            "X-RateLimit-Remaining": "7",
        }
        return PlainTextResponse("ok")

    app = _build_app(SecurityHeadersMiddleware, route_handler=_with_rl)
    client = await client_factory(app)

    resp = await client.get("/probe")

    assert resp.headers["X-RateLimit-Limit"] == "10"
    assert resp.headers["X-RateLimit-Remaining"] == "7"


# ── RequestIDMiddleware ───────────────────────────────────────────────────────
async def test_request_id_generated_when_absent(client_factory) -> None:
    app = _build_app(RequestIDMiddleware)
    client = await client_factory(app)

    resp = await client.get("/probe")

    request_id = resp.headers.get("X-Request-ID")
    assert request_id
    # A generated id is uuid4().hex — 32 lowercase hex characters.
    assert len(request_id) == 32
    int(request_id, 16)  # raises ValueError if not hex


async def test_request_id_echoed_when_supplied(client_factory) -> None:
    app = _build_app(RequestIDMiddleware)
    client = await client_factory(app)

    resp = await client.get("/probe", headers={"X-Request-ID": "given-id-7"})

    assert resp.headers["X-Request-ID"] == "given-id-7"


async def test_request_id_visible_in_contextvar_during_request(
    client_factory,
) -> None:
    """The id is set in the contextvar while the handler runs, reset after."""

    async def _capture(_request: Request) -> JSONResponse:
        return JSONResponse({"rid": request_id_var.get()})

    app = _build_app(RequestIDMiddleware, route_handler=_capture)
    client = await client_factory(app)

    resp = await client.get("/probe", headers={"X-Request-ID": "ctx-id"})

    assert resp.json()["rid"] == "ctx-id"
    assert resp.headers["X-Request-ID"] == "ctx-id"


async def test_request_id_contextvar_reset_after_request(client_factory) -> None:
    """The middleware resets the contextvar in its ``finally`` block."""
    app = _build_app(RequestIDMiddleware)
    client = await client_factory(app)

    await client.get("/probe", headers={"X-Request-ID": "leak-check"})

    # Once the response is fully returned, the test task must not observe a
    # leaked request id from the handled request.
    assert request_id_var.get() is None
