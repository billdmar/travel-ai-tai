"""Curated-destination REST endpoint under ``/api/v1``.

Serves the Explore gallery's curated atlas from the database, replacing the
frontend's former hardcoded ``DESTINATIONS`` array. The list lives in the
``destinations`` table (seeded by the Alembic migration on Postgres and by the
startup seed on SQLite/dev) and is returned in the gallery's deliberate
editorial order via ``ORDER BY sort_order``.

Path is ``GET /api/v1/destinations/curated`` — deliberately distinct from the
LLM discovery route ``POST /api/v1/destinations/recommend`` (api/routes/
destinations.py) so the two share a prefix without colliding.

The response model is defined here rather than in ``api/models.py`` because it
is specific to this read endpoint and mirrors the frontend
``CuratedDestination`` interface (camelCase field aliases) so the client can
consume the rows directly as its fallback array shape.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db import Destination, get_session

router = APIRouter(prefix="/api/v1", tags=["destinations"])


class CuratedDestination(BaseModel):
    """One curated Explore-gallery destination (editorial discovery copy).

    Field aliases are camelCase to match the frontend ``CuratedDestination``
    interface (web/src/components/explore/destinations.ts) so the JSON payload
    drops straight into the gallery without a client-side remap.
    """

    # Serialize by alias so the response is camelCase for the frontend.
    model_config = ConfigDict(populate_by_name=True)

    slug: str
    name: str
    country: str
    query: str
    tagline: str
    best_season: str = Field(serialization_alias="bestSeason")
    vibes: list[str]
    story: list[str]


class CuratedDestinationsResponse(BaseModel):
    """Envelope wrapping the curated destinations in editorial order."""

    destinations: list[CuratedDestination]


@router.get(
    "/destinations/curated",
    response_model=CuratedDestinationsResponse,
    response_model_by_alias=True,
)
async def list_curated_destinations(
    session: AsyncSession = Depends(get_session),
) -> CuratedDestinationsResponse:
    """Return the curated Explore atlas, ordered by the editorial ``sort_order``."""
    rows = (
        await session.scalars(
            select(Destination).order_by(Destination.sort_order)
        )
    ).all()
    return CuratedDestinationsResponse(
        destinations=[
            CuratedDestination.model_validate(row, from_attributes=True)
            for row in rows
        ]
    )
