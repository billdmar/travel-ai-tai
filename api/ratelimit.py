"""Shared slowapi limiter and a FastAPI rate-limit dependency.

A single module-level :class:`Limiter` is created so it can be referenced both
by the application factory (which sets ``limiter.enabled`` from the
``RATE_LIMIT_ENABLED`` setting and registers the 429 handler) and by the
:func:`rate_limit` dependency below.

The limit is applied as a *dependency* rather than slowapi's ``@limiter.limit``
decorator: the decorator wraps the endpoint with ``functools.wraps`` which
repoints ``__globals__`` to slowapi's module, so FastAPI can no longer resolve
the route's string annotations (under ``from __future__ import annotations``)
and mis-classifies the request body. The dependency approach keeps the
endpoint signature pristine while still enforcing the limit.

The dependency also computes the standard ``X-RateLimit-Limit/Remaining/Reset``
headers and stashes them on ``request.state.rate_limit_headers``;
:class:`api.middleware.SecurityHeadersMiddleware` copies that dict onto the
outgoing response, so the headers appear on both the 2xx and 429 responses
without coupling the route signatures to slowapi. The ``Retry-After`` header on
a hit remains owned by the 429 handler in the app factory.
"""

from __future__ import annotations

import math
import time
from collections.abc import Awaitable, Callable

from limits import RateLimitItemPerMinute
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from api.config import Settings

#: Process-wide limiter; ``enabled`` is set per-app by the factory.
limiter = Limiter(key_func=get_remote_address)

# Per-route limits, defined centrally. Writes are tighter than reads; the
# scope string keeps each route's window independent in the shared limiter.
#: 10 writes per minute on itinerary creation.
_CREATE_LIMIT = RateLimitItemPerMinute(10)
#: Reads are more generous (listing, single GET, shared view, export, images).
_READ_LIMIT = RateLimitItemPerMinute(60)


def _reset_after_seconds(reset_time: float) -> int:
    """Whole seconds until the window resets (never negative)."""
    return max(0, math.ceil(reset_time - time.time()))


def _make_rate_limit(
    limit_item: RateLimitItemPerMinute, scope: str
) -> Callable[[Request], Awaitable[None]]:
    """Build a per-IP rate-limit dependency for ``scope`` against ``limit_item``.

    The returned dependency no-ops when the limiter is disabled
    (``RATE_LIMIT_ENABLED=false``). On every enabled call it records
    ``X-RateLimit-*`` headers on ``request.state`` for the middleware to emit;
    on a hit it raises ``RateLimitExceeded``, rendered as the project's 429
    envelope by the handler registered in the app factory.
    """
    limit_value = limit_item.amount

    async def _dependency(request: Request) -> None:
        if not limiter.enabled:
            return
        settings: Settings = request.app.state.settings
        if not settings.rate_limit_enabled:
            return

        key = get_remote_address(request)
        allowed = limiter.limiter.hit(limit_item, scope, key)
        stats = limiter.limiter.get_window_stats(limit_item, scope, key)
        reset_after = _reset_after_seconds(stats.reset_time)

        headers = {
            "X-RateLimit-Limit": str(limit_value),
            "X-RateLimit-Remaining": str(max(0, stats.remaining)),
            "X-RateLimit-Reset": str(reset_after),
        }
        request.state.rate_limit_headers = headers

        if not allowed:
            from slowapi.errors import RateLimitExceeded
            from slowapi.wrappers import Limit

            limit = Limit(
                limit_item,
                get_remote_address,
                scope=scope,
                per_method=False,
                methods=None,
                error_message=None,
                exempt_when=None,
                cost=1,
                override_defaults=True,
            )
            raise RateLimitExceeded(limit)

    return _dependency


#: Write limit for ``POST /itineraries`` (kept under the original name/scope).
rate_limit = _make_rate_limit(_CREATE_LIMIT, "create_itinerary")
#: Read limits, one independent scope per read route.
rate_limit_list = _make_rate_limit(_READ_LIMIT, "list_itineraries")
rate_limit_get = _make_rate_limit(_READ_LIMIT, "get_itinerary")
rate_limit_shared = _make_rate_limit(_READ_LIMIT, "get_shared")
rate_limit_export = _make_rate_limit(_READ_LIMIT, "export_itinerary")
rate_limit_image = _make_rate_limit(_READ_LIMIT, "get_image")
