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
"""

from __future__ import annotations

from limits import RateLimitItemPerMinute
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from api.config import Settings

#: Process-wide limiter; ``enabled`` is set per-app by the factory.
limiter = Limiter(key_func=get_remote_address)

#: 10 requests per minute on itinerary creation.
_CREATE_LIMIT = RateLimitItemPerMinute(10)


async def rate_limit(request: Request) -> None:
    """Enforce the per-IP creation limit, raising ``RateLimitExceeded`` on hit.

    No-ops when the limiter is disabled (``RATE_LIMIT_ENABLED=false``). The
    raised exception is rendered as the project's 429 envelope by the handler
    registered in the app factory.
    """
    if not limiter.enabled:
        return
    settings: Settings = request.app.state.settings
    if not settings.rate_limit_enabled:
        return

    key = get_remote_address(request)
    if not limiter.limiter.hit(_CREATE_LIMIT, "create_itinerary", key):
        from slowapi.errors import RateLimitExceeded
        from slowapi.wrappers import Limit

        limit = Limit(
            _CREATE_LIMIT,
            get_remote_address,
            scope="create_itinerary",
            per_method=False,
            methods=None,
            error_message=None,
            exempt_when=None,
            cost=1,
            override_defaults=True,
        )
        raise RateLimitExceeded(limit)
