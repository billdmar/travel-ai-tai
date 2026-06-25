"""Unit tests for the ASGI middleware in :mod:`api.middleware`.

These exercise ``RequestIDMiddleware`` and ``SecurityHeadersMiddleware`` in
isolation by mounting them on a tiny Starlette app, so the assertions target the
middleware behaviour directly rather than the assembled production app (which
``tests/test_hardening.py`` already covers end-to-end). All tests are network
free and run against an in-process ASGI transport.
"""

from __future__ import annotations

import logging

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, PlainTextResponse
from starlette.routing import Route

from api.logging_config import (
    JsonLogFormatter,
    client_ip_var,
    request_id_var,
    request_method_var,
    request_path_var,
)
from api.middleware import (
    _SECURITY_HEADERS,
    MetricsMiddleware,
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


# ── Structured log context (path / method / client_ip) ────────────────────────
async def test_request_context_in_log_record_during_request(client_factory) -> None:
    """The JSON formatter stamps path/method/client_ip while a request runs."""
    rendered: dict[str, str] = {}

    async def _log(_request: Request) -> PlainTextResponse:
        # Emit a record inside the request and capture the formatter's output,
        # so the assertion reflects exactly what a real handler's log produces.
        record = logging.LogRecord(
            "tai.test", logging.INFO, __file__, 0, "hello", None, None
        )
        rendered["json"] = JsonLogFormatter().format(record)
        return PlainTextResponse("ok")

    app = _build_app(RequestIDMiddleware, route_handler=_log)
    client = await client_factory(app)

    await client.get(
        "/probe", headers={"X-Forwarded-For": "203.0.113.7, 10.0.0.1"}
    )

    payload = rendered["json"]
    assert '"path": "/probe"' in payload
    assert '"method": "GET"' in payload
    # First X-Forwarded-For hop is the trusted client IP.
    assert '"client_ip": "203.0.113.7"' in payload


def test_log_formatter_omits_request_context_outside_request() -> None:
    """With no request active the context fields are absent from the payload."""
    # The contextvars default to None outside a request; the formatter must not
    # emit empty path/method/client_ip keys then.
    assert request_path_var.get() is None
    assert request_method_var.get() is None
    assert client_ip_var.get() is None

    record = logging.LogRecord(
        "tai.test", logging.INFO, __file__, 0, "no-request", None, None
    )
    payload = JsonLogFormatter().format(record)
    assert "path" not in payload
    assert "method" not in payload
    assert "client_ip" not in payload


# ── MetricsMiddleware + /metrics (opt-in) ─────────────────────────────────────
def _build_metrics_app() -> Starlette:
    """A Starlette app wiring MetricsMiddleware + the /metrics route.

    Mirrors what ``create_app`` does when ``ENABLE_METRICS`` is true (the
    orchestrator adds the one ``include_router`` line in main.py). The disabled
    case — endpoint absent — is covered against the real app fixture below.
    """
    from api.routes.metrics import metrics as metrics_endpoint

    async def _ok(_request: Request) -> PlainTextResponse:
        return PlainTextResponse("ok")

    async def _metrics(_request: Request):
        # The FastAPI route handler takes no args; adapt it to Starlette's
        # request-positional signature for this minimal mounting.
        return await metrics_endpoint()

    app = Starlette(
        routes=[
            Route("/probe", _ok),
            Route("/metrics", _metrics),
        ]
    )
    app.add_middleware(MetricsMiddleware)
    return app


async def test_metrics_endpoint_exposes_metric_names(client_factory) -> None:
    """With metrics wired, a request is recorded and /metrics renders it."""
    app = _build_metrics_app()
    client = await client_factory(app)

    # Drive a request so the middleware records the metric series.
    await client.get("/probe")

    resp = await client.get("/metrics")

    assert resp.status_code == 200
    body = resp.text
    assert "request_count" in body
    assert "request_duration_seconds" in body
    # The label is the matched route identity (the ``_ok`` endpoint name under
    # plain Starlette routing here; FastAPI's APIRoute would yield the path
    # template), never the raw URL — so distinct ids never explode cardinality.
    assert "_ok" in body
    assert 'method="GET"' in body
    assert 'status="200"' in body


async def test_metrics_endpoint_absent_when_not_wired(client) -> None:
    """The default app fixture does not wire /metrics, so it 404s."""
    resp = await client.get("/metrics")
    assert resp.status_code == 404
