"""Security headers and request-id ASGI middleware (BE-HARDEN).

``SecurityHeadersMiddleware`` adds conservative hardening headers to every
response. The Content-Security-Policy and HSTS are deliberately permissive
enough to keep the Swagger UI at ``/docs`` working (it loads its bundle from a
CDN and uses inline styles/scripts) and the bundled React SPA functioning.

``RequestIDMiddleware`` accepts an inbound ``X-Request-ID`` (or generates a
uuid4), stores it in the :data:`api.logging_config.request_id_var` contextvar so
structured logs are correlated, and echoes it back on the response.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from starlette.middleware.base import BaseHTTPMiddleware

from api.logging_config import request_id_var

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from starlette.requests import Request
    from starlette.responses import Response

_REQUEST_ID_HEADER = "X-Request-ID"

# CSP that keeps Swagger UI (/docs) and the SPA working. Swagger pulls its JS/CSS
# from jsdelivr and uses inline script/style; the SPA loads same-origin assets,
# remote images (Unsplash proxy), and connects to same-origin APIs.
_CSP = (
    "default-src 'self'; "
    "img-src 'self' data: https:; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "font-src 'self' data: https:; "
    "connect-src 'self' https:; "
    "frame-ancestors 'none'; "
    "base-uri 'self'"
)

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": _CSP,
    # 1 year; safe because the app is served over HTTPS on Render and HSTS is
    # ignored by browsers over plain HTTP (e.g. local dev).
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach conservative security headers to every response."""

    async def dispatch(
        self,
        request: "Request",
        call_next: "Callable[[Request], Awaitable[Response]]",
    ) -> "Response":
        response = await call_next(request)
        for header, value in _SECURITY_HEADERS.items():
            response.headers.setdefault(header, value)
        # The rate-limit dependency stashes X-RateLimit-* (and Retry-After on a
        # hit) here; surface them on both 2xx and 429 responses.
        rate_limit_headers = getattr(request.state, "rate_limit_headers", None)
        if rate_limit_headers:
            for header, value in rate_limit_headers.items():
                response.headers[header] = value
        return response


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Accept/generate a request id, stash it in a contextvar, echo it back."""

    async def dispatch(
        self,
        request: "Request",
        call_next: "Callable[[Request], Awaitable[Response]]",
    ) -> "Response":
        request_id = request.headers.get(_REQUEST_ID_HEADER) or uuid.uuid4().hex
        request.state.request_id = request_id
        token = request_id_var.set(request_id)
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        response.headers[_REQUEST_ID_HEADER] = request_id
        return response
