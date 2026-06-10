"""Itinerary REST endpoints under ``/api/v1``.

Covers generation (POST), retrieval, paginated listing, soft-delete,
preference validation (no LLM call), and a DEBUG-gated token-stats endpoint.
The recommendation engine, cache, and settings live on ``app.state`` so the
handlers stay thin and the app factory owns construction.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import Settings
from api.db import ItineraryRecord, get_session
from api.llm.provider import TOKEN_COUNTER
from api.models import (
    ItineraryListItem,
    ItineraryListResponse,
    ItineraryResponse,
    TravelPreferences,
)
from api.ratelimit import rate_limit
from api.recommend import (
    ItineraryParseError,
    LLMUnavailableError,
    RecommendationEngine,
    record_to_response,
)

router = APIRouter(prefix="/api/v1", tags=["itineraries"])


def _engine(request: Request) -> RecommendationEngine:
    return request.app.state.engine


@router.post(
    "/itineraries",
    response_model=ItineraryResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit)],
)
async def create_itinerary(
    request: Request,
    preferences: TravelPreferences,
    session: AsyncSession = Depends(get_session),
) -> ItineraryResponse:
    """Generate a personalized itinerary from travel preferences.

    Rate-limited to 10 requests/minute/IP via the ``rate_limit`` dependency
    when rate limiting is enabled.
    """
    engine = _engine(request)
    try:
        return await engine.generate(preferences, session)
    except LLMUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "llm_unavailable"},
            headers={"Retry-After": "60"},
        ) from exc
    except ItineraryParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"error": "itinerary_parse_failed"},
        ) from exc


@router.get("/itineraries/{itinerary_id}", response_model=ItineraryResponse)
async def get_itinerary(
    itinerary_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> ItineraryResponse:
    """Retrieve a previously generated itinerary by id (404 if soft-deleted)."""
    record = await session.get(ItineraryRecord, str(itinerary_id))
    if record is None or record.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "itinerary_not_found"},
        )
    return record_to_response(record)


@router.post("/itineraries/{itinerary_id}/save", response_model=ItineraryResponse)
async def save_itinerary(
    itinerary_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> ItineraryResponse:
    """Explicitly save a draft itinerary so it appears in the Saved list.

    Sets ``saved_at`` to now if not already set (idempotent — re-saving keeps
    the original timestamp). Returns the itinerary with ``saved=True``; 404 if
    missing or soft-deleted.
    """
    record = await session.get(ItineraryRecord, str(itinerary_id))
    if record is None or record.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "itinerary_not_found"},
        )
    if record.saved_at is None:
        record.saved_at = datetime.now(timezone.utc)
        await session.commit()
    return record_to_response(record)


@router.get("/itineraries", response_model=ItineraryListResponse)
async def list_itineraries(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
) -> ItineraryListResponse:
    """List SAVED itineraries (paginated, excluding soft-deleted records).

    Only itineraries explicitly saved (``saved_at IS NOT NULL``) appear here;
    freshly generated drafts are persisted but stay out of the Saved list until
    saved via ``POST /itineraries/{id}/save``.
    """
    live = ItineraryRecord.deleted_at.is_(None)
    saved = ItineraryRecord.saved_at.is_not(None)

    total = await session.scalar(
        select(func.count()).select_from(ItineraryRecord).where(live, saved)
    )
    rows = await session.scalars(
        select(ItineraryRecord)
        .where(live, saved)
        .order_by(ItineraryRecord.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )

    items = [
        ItineraryListItem(
            id=UUID(record.id),
            created_at=record.created_at,
            destination=response.preferences.destination,
            start_date=response.preferences.start_date,
            end_date=response.preferences.end_date,
            total_estimated_cost_usd=response.total_estimated_cost_usd,
        )
        for record in rows
        if (response := record_to_response(record))
    ]
    return ItineraryListResponse(
        page=page, per_page=per_page, total=total or 0, items=items
    )


@router.delete("/itineraries/{itinerary_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_itinerary(
    itinerary_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Soft-delete an itinerary by setting ``deleted_at`` (404 if missing)."""
    record = await session.get(ItineraryRecord, str(itinerary_id))
    if record is None or record.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "itinerary_not_found"},
        )
    record.deleted_at = datetime.now(timezone.utc)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/preferences/validate")
async def validate_preferences(preferences: TravelPreferences) -> dict[str, bool]:
    """Validate a preference payload without calling the LLM.

    Returns ``{"valid": true}`` for accepted input; invalid input is rejected
    by Pydantic with a 422 before this handler runs.
    """
    return {"valid": True}


@router.get("/debug/token-stats")
async def token_stats(request: Request) -> dict[str, int]:
    """Return cumulative tokens used this process lifetime (DEBUG only)."""
    settings: Settings = request.app.state.settings
    if not settings.debug_mode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return {"total_tokens_used": TOKEN_COUNTER.total}
