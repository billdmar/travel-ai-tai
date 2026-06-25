"""Unit tests for :class:`api.cache.ItineraryCache`.

Exercise the in-memory (default) backend: store/return round-trips, miss
behaviour, TTL expiry (via a monkeypatched short TTL on the underlying
``TTLCache``), and concurrent-access safety under the asyncio lock. The Redis
branch is not exercised here — it is guarded by ``CACHE_BACKEND=redis`` and the
suite runs ``CACHE_BACKEND=memory`` so the import path stays optional.
"""

from __future__ import annotations

import asyncio

import pytest
from cachetools import TTLCache

from api import cache as cache_module
from api.cache import ItineraryCache
from api.config import Settings


def _memory_cache() -> ItineraryCache:
    """An ItineraryCache backed by the default in-memory TTLCache."""
    return ItineraryCache(Settings(CACHE_BACKEND="memory"))


def test_backend_is_memory_without_redis() -> None:
    cache = _memory_cache()
    assert cache.backend == "memory"


async def test_set_then_get_round_trips() -> None:
    cache = _memory_cache()
    await cache.set("fingerprint-a", "itin-123")
    assert await cache.get("fingerprint-a") == "itin-123"


async def test_get_missing_key_returns_none() -> None:
    cache = _memory_cache()
    assert await cache.get("never-stored") is None


async def test_set_overwrites_existing_value() -> None:
    cache = _memory_cache()
    await cache.set("k", "first")
    await cache.set("k", "second")
    assert await cache.get("k") == "second"


async def test_entry_expires_after_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    """A stored entry is evicted once its TTL window elapses."""
    # Build the cache with a sub-second TTL by patching the module constant the
    # constructor reads when sizing the TTLCache.
    monkeypatch.setattr(cache_module, "_TTL_SECONDS", 0.05)
    cache = _memory_cache()

    await cache.set("ephemeral", "itin-x")
    assert await cache.get("ephemeral") == "itin-x"

    # Past the TTL, cachetools evicts on the next access → miss.
    await asyncio.sleep(0.1)
    assert await cache.get("ephemeral") is None


async def test_concurrent_access_is_safe() -> None:
    """Many overlapping get/set tasks complete without lost writes or errors."""
    cache = _memory_cache()

    async def writer(i: int) -> None:
        await cache.set(f"key-{i}", f"itin-{i}")

    async def reader(i: int) -> None:
        # Read may race the write; assert only that no exception escapes and the
        # eventual stored value is consistent (checked after the gather below).
        await cache.get(f"key-{i}")

    tasks = []
    for i in range(50):
        tasks.append(asyncio.create_task(writer(i)))
        tasks.append(asyncio.create_task(reader(i)))
    await asyncio.gather(*tasks)

    # Every write must be durably visible once all tasks have settled.
    for i in range(50):
        assert await cache.get(f"key-{i}") == f"itin-{i}"


async def test_evicts_least_recently_used_past_maxsize(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The underlying TTLCache respects its maxsize bound."""
    monkeypatch.setattr(cache_module, "_MAX_SIZE", 2)
    cache = _memory_cache()

    await cache.set("a", "1")
    await cache.set("b", "2")
    await cache.set("c", "3")  # exceeds maxsize=2 → one prior entry evicted

    # Backing store never grows past the cap regardless of insertion count.
    assert isinstance(cache._memory, TTLCache)
    assert len(cache._memory) == 2
