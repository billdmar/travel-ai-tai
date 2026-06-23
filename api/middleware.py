"""ASGI middleware stubs (FOUNDATION).

These are no-op pass-through middlewares so the app boots and tests pass before
the BE-HARDEN agent fills them with real security headers and request-id
tracing. Both subclass Starlette's ``BaseHTTPMiddleware`` and simply forward the
request untouched.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from starlette.middleware.base import BaseHTTPMiddleware

if TYPE_CHECKING:
    from starlette.requests import Request
    from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Pass-through stub. BE-HARDEN adds security response headers here."""

    async def dispatch(self, request: "Request", call_next) -> "Response":  # type: ignore[override]
        return await call_next(request)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Pass-through stub. BE-HARDEN injects a per-request id here."""

    async def dispatch(self, request: "Request", call_next) -> "Response":  # type: ignore[override]
        return await call_next(request)
