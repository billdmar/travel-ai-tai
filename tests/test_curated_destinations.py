"""Tests for the DB-backed curated-destinations endpoint.

Covers the read path ``GET /api/v1/destinations/curated`` (seeded via the
startup hook on the SQLite test backend), the editorial ordering contract, the
camelCase payload shape the frontend consumes, and the idempotency of the seed
routine. Uses the shared ``client`` fixture (its lifespan runs the startup seed)
and the ``sessionmaker`` fixture for direct seed-helper assertions.
"""

from __future__ import annotations

from httpx import AsyncClient

from api.seed_destinations import (
    SEED_DESTINATIONS,
    seed_destinations_if_empty,
)


async def test_curated_endpoint_returns_all_seeded_rows(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/destinations/curated")
    assert resp.status_code == 200
    body = resp.json()
    # Every curated entry is served — the gallery's full atlas.
    assert len(body["destinations"]) == len(SEED_DESTINATIONS)


async def test_curated_endpoint_preserves_editorial_order(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/destinations/curated")
    slugs = [d["slug"] for d in resp.json()["destinations"]]
    # Order matches the canonical seed list (sort_order), not alphabetical.
    assert slugs == [d["slug"] for d in SEED_DESTINATIONS]


async def test_curated_endpoint_returns_camelcase_frontend_shape(
    client: AsyncClient,
) -> None:
    resp = await client.get("/api/v1/destinations/curated")
    first = resp.json()["destinations"][0]
    # Payload mirrors the frontend CuratedDestination interface exactly.
    assert set(first) == {
        "slug",
        "name",
        "country",
        "query",
        "tagline",
        "bestSeason",
        "vibes",
        "story",
    }
    assert first["slug"] == "kyoto"
    assert isinstance(first["vibes"], list) and first["vibes"]
    assert isinstance(first["story"], list) and first["story"]


async def test_seed_is_idempotent(client: AsyncClient, sessionmaker) -> None:
    # The client fixture's lifespan already seeded the table; a second call must
    # insert nothing and leave the row count unchanged.
    async with sessionmaker() as session:
        inserted = await seed_destinations_if_empty(session)
    assert inserted == 0

    resp = await client.get("/api/v1/destinations/curated")
    assert len(resp.json()["destinations"]) == len(SEED_DESTINATIONS)
