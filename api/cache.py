"""Itinerary response cache.

Maps a preference fingerprint (SHA-256 of the canonical preference JSON) to a
previously generated itinerary id so that identical requests within the TTL
window resolve to the same stored record. Backed by an in-memory
``cachetools.TTLCache`` guarded by an asyncio lock; an optional Redis backend
is used when ``CACHE_BACKEND=redis`` with silent fallback to in-memory if the
Redis import or connection fails.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from cachetools import TTLCache

if TYPE_CHECKING:
    from api.config import Settings

logger = logging.getLogger("tai.cache")

_TTL_SECONDS = 3600
_MAX_SIZE = 1000


class ItineraryCache:
    """Async-safe cache mapping preference fingerprints to itinerary ids."""

    def __init__(self, settings: Settings) -> None:
        self._lock = asyncio.Lock()
        self._memory: TTLCache[str, str] = TTLCache(maxsize=_MAX_SIZE, ttl=_TTL_SECONDS)
        self._redis = None

        if settings.cache_backend == "redis":
            self._redis = self._connect_redis(settings.redis_url)
            if self._redis is None:
                logger.warning(
                    "CACHE_BACKEND=redis but Redis is unavailable; "
                    "falling back to in-memory cache."
                )

    @staticmethod
    def _connect_redis(redis_url: str | None):  # noqa: ANN205 - optional dep type
        """Attempt to build an async Redis client, returning None on failure."""
        if not redis_url:
            return None
        try:
            from redis import asyncio as aioredis

            return aioredis.from_url(redis_url, decode_responses=True)
        except Exception as exc:  # pragma: no cover - optional/never in tests
            logger.warning("Redis client init failed: %s", exc)
            return None

    @property
    def backend(self) -> str:
        """Active backend name (``redis`` only when a client was created)."""
        return "redis" if self._redis is not None else "memory"

    async def get(self, key: str) -> str | None:
        """Return the cached itinerary id for ``key`` if present."""
        if self._redis is not None:
            try:
                return await self._redis.get(self._redis_key(key))
            except Exception as exc:  # pragma: no cover - network path
                logger.warning("Redis GET failed, using memory: %s", exc)
        async with self._lock:
            return self._memory.get(key)

    async def set(self, key: str, itinerary_id: str) -> None:
        """Associate ``key`` with ``itinerary_id``."""
        if self._redis is not None:
            try:
                await self._redis.set(
                    self._redis_key(key), itinerary_id, ex=_TTL_SECONDS
                )
                return
            except Exception as exc:  # pragma: no cover - network path
                logger.warning("Redis SET failed, using memory: %s", exc)
        async with self._lock:
            self._memory[key] = itinerary_id

    @staticmethod
    def _redis_key(key: str) -> str:
        return f"tai:itinerary:{key}"
