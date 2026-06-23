"""Liveness and readiness endpoints.

``/health`` is a dependency-free liveness probe (always 200 while the process
is up). ``/ready`` is a readiness probe that verifies the app can actually
serve traffic: it opens a DB session and runs ``SELECT 1``, and exercises the
cache backend. It returns 200 only when both pass, otherwise 503.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, Request, Response, status
from sqlalchemy import text

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from api.cache import ItineraryCache
    from api.config import Settings

logger = logging.getLogger("tai.health")

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(request: Request) -> dict[str, str]:
    """Return service liveness and version (no external dependencies)."""
    settings: Settings = request.app.state.settings
    return {"status": "ok", "version": settings.version}


async def _check_db(sessionmaker: async_sessionmaker) -> bool:
    """Run ``SELECT 1`` through a real session; True on success."""
    try:
        async with sessionmaker() as session:
            await session.execute(text("SELECT 1"))
        return True
    except Exception as exc:  # pragma: no cover - exercised via mocked failure
        logger.warning("readiness DB check failed: %s", exc)
        return False


async def _check_cache(cache: ItineraryCache) -> bool:
    """Round-trip the cache backend; True on success."""
    try:
        await cache.get("__readiness_probe__")
        return True
    except Exception as exc:  # pragma: no cover - exercised via mocked failure
        logger.warning("readiness cache check failed: %s", exc)
        return False


@router.get("/ready")
async def ready(request: Request, response: Response) -> dict[str, object]:
    """Readiness: 200 when DB and cache are reachable, else 503."""
    sessionmaker: async_sessionmaker = request.app.state.sessionmaker
    cache: ItineraryCache = request.app.state.cache

    db_ok = await _check_db(sessionmaker)
    cache_ok = await _check_cache(cache)
    ready_ok = db_ok and cache_ok

    if not ready_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ready" if ready_ok else "not_ready",
        "db": "ok" if db_ok else "unreachable",
        "cache": "ok" if cache_ok else "unreachable",
    }
