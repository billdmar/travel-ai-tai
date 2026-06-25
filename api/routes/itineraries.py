"""Itinerary REST endpoints under ``/api/v1``.

Covers generation (POST), retrieval, paginated listing, soft-delete,
preference validation (no LLM call), and a DEBUG-gated token-stats endpoint.
The recommendation engine, cache, and settings live on ``app.state`` so the
handlers stay thin and the app factory owns construction.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import Settings
from api.db import ItineraryRecord, get_session
from api.http_helpers import (
    get_itinerary_or_404,
    raise_itinerary_parse_failed,
    raise_llm_unavailable,
)
from api.llm.provider import TOKEN_COUNTER
from api.models import (
    Activity,
    DayActivitiesReorderRequest,
    GeneratedItinerary,
    ItineraryListResponse,
    ItineraryResponse,
    TravelPreferences,
)
from api.ratelimit import rate_limit, rate_limit_get, rate_limit_list
from api.recommend import (
    ItineraryParseError,
    LLMUnavailableError,
    RecommendationEngine,
    normalize_generated,
    record_to_list_item,
    record_to_response,
)
from api.share import delete_tokens_for_itinerary

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
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> ItineraryResponse:
    """Generate a personalized itinerary from travel preferences.

    Rate-limited to 10 requests/minute/IP via the ``rate_limit`` dependency
    when rate limiting is enabled. When the selected provider silently degraded
    to the mock for this request (e.g. Gemini quota exhausted), the visible
    ``X-LLM-Fallback`` header carries the reason so clients/monitoring can see
    it (the itinerary itself is still returned).
    """
    engine = _engine(request)
    try:
        itinerary = await engine.generate(preferences, session)
    except LLMUnavailableError:
        raise_llm_unavailable()
    except ItineraryParseError:
        raise_itinerary_parse_failed()
    if itinerary.fallback_reason is not None:
        response.headers["X-LLM-Fallback"] = itinerary.fallback_reason
    return itinerary


@router.post(
    "/itineraries/{itinerary_id}/regenerate",
    response_model=ItineraryResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit)],
)
async def regenerate_itinerary(
    itinerary_id: UUID,
    request: Request,
    preferences: TravelPreferences,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> ItineraryResponse:
    """Regenerate a trip from adjusted preferences, starting from an existing one.

    The ``{itinerary_id}`` anchors the request to a real source trip (404 if it
    is missing or soft-deleted) so the UI's "Adjust trip" affordance always
    starts from something the user is looking at. The ``preferences`` body is the
    *adjusted* preference set; this generates a brand-new itinerary (new id) via
    the same :meth:`RecommendationEngine.generate` path as ``POST /itineraries``
    and does NOT mutate the source row — the original trip is left intact.

    Carries the same write rate limit and the same error mapping (503/502) and
    ``X-LLM-Fallback`` surfacing as creation, since it shares the engine path.
    """
    await get_itinerary_or_404(session, itinerary_id)

    engine = _engine(request)
    try:
        itinerary = await engine.generate(preferences, session)
    except LLMUnavailableError:
        raise_llm_unavailable()
    except ItineraryParseError:
        raise_itinerary_parse_failed()
    if itinerary.fallback_reason is not None:
        response.headers["X-LLM-Fallback"] = itinerary.fallback_reason
    return itinerary


@router.get(
    "/itineraries/{itinerary_id}",
    response_model=ItineraryResponse,
    dependencies=[Depends(rate_limit_get)],
)
async def get_itinerary(
    itinerary_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> ItineraryResponse:
    """Retrieve a previously generated itinerary by id (404 if soft-deleted)."""
    record = await get_itinerary_or_404(session, itinerary_id)
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

    The stamp is applied via a single conditional UPDATE guarded by
    ``saved_at IS NULL`` rather than a read-modify-write, so two concurrent
    saves cannot both observe ``None`` and race to commit different timestamps:
    only the first writer matches the predicate and stamps the row; the second
    matches no rows and is a no-op, leaving the original timestamp intact. The
    row is re-fetched afterwards so the response reflects the committed value
    (the surviving timestamp) regardless of which request won the race.
    """
    iid = str(itinerary_id)
    await session.execute(
        update(ItineraryRecord)
        .where(
            ItineraryRecord.id == iid,
            ItineraryRecord.deleted_at.is_(None),
            ItineraryRecord.saved_at.is_(None),
        )
        .values(saved_at=datetime.now(timezone.utc))
    )
    await session.commit()

    # Re-fetch the row to return the committed state. ``session.get`` after a
    # commit re-reads from the DB, so the response carries the surviving
    # ``saved_at`` even when this request's UPDATE matched no rows (a re-save or
    # the losing side of a concurrent race).
    record = await get_itinerary_or_404(session, itinerary_id)
    return record_to_response(record)


@router.get(
    "/itineraries",
    response_model=ItineraryListResponse,
    dependencies=[Depends(rate_limit_list)],
)
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

    # Project each row straight onto the compact list item. Using the full
    # ``record_to_response`` here would re-normalize every activity (rebuilding
    # per-activity map and booking links) just to read four scalars — wasted
    # O(rows x activities) work on every call. ``record_to_list_item`` derives
    # only what the list shows, with an identical grand-total computation.
    items = [record_to_list_item(record) for record in rows]
    return ItineraryListResponse(
        page=page, per_page=per_page, total=total or 0, items=items
    )


@router.delete("/itineraries/{itinerary_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_itinerary(
    itinerary_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Soft-delete an itinerary by setting ``deleted_at`` (404 if missing)."""
    record = await get_itinerary_or_404(session, itinerary_id)
    record.deleted_at = datetime.now(timezone.utc)
    # Invalidate any public share links so a deleted trip stops resolving.
    await delete_tokens_for_itinerary(session, record.id)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _edit_day_activities(
    *,
    itinerary_id: UUID,
    day_number: int,
    session: AsyncSession,
    mutate: Callable[[list[Activity]], list[Activity]],
) -> ItineraryResponse:
    """Load a live itinerary, edit one day's activity list, and re-persist it.

    Shared by the reorder (PUT) and remove (DELETE) endpoints. The stored
    ``itinerary_json`` is the LLM-facing :class:`GeneratedItinerary` blob; we
    parse it, locate the target day by ``day_number`` (404 if absent, e.g. an
    out-of-range day), and hand that day's activity list to ``mutate`` which
    returns the new ordering/subset. The whole itinerary is then re-run through
    :func:`normalize_generated` so the grand total and the per-activity map and
    booking links stay consistent with the new activity set, the corrected blob
    is written back **in place** on the existing record, and the refreshed
    :class:`ItineraryResponse` is returned.

    This is an in-place content edit of an already-persisted itinerary keyed by
    its opaque id — consistent with the no-auth, single-session model (the
    record the user is holding), so no ownership check is involved. A missing or
    soft-deleted itinerary, or an out-of-range day/index, surfaces the shared
    ``itinerary_not_found`` error envelope as a 404.
    """
    record = await get_itinerary_or_404(session, itinerary_id)

    preferences = TravelPreferences.model_validate_json(record.preferences_json)
    generated = GeneratedItinerary.model_validate_json(record.itinerary_json)

    target = next(
        (day for day in generated.days if day.day_number == day_number), None
    )
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "itinerary_not_found"},
        )

    # ``mutate`` raises HTTPException(404) for an out-of-range index/order; on
    # success it returns the new activity list for this day.
    new_activities = mutate(list(target.activities))

    new_days = [
        day.model_copy(update={"activities": new_activities})
        if day.day_number == day_number
        else day
        for day in generated.days
    ]
    edited = generated.model_copy(update={"days": new_days})
    # Re-derive grand total + canonical map/booking links so everything reconciles
    # with the new activity set before storing.
    edited = normalize_generated(edited, preferences)

    record.itinerary_json = edited.model_dump_json()
    await session.commit()
    await session.refresh(record)
    return record_to_response(record)


@router.put(
    "/itineraries/{itinerary_id}/days/{day_number}/activities",
    response_model=ItineraryResponse,
    dependencies=[Depends(rate_limit)],
)
async def reorder_day_activities(
    itinerary_id: UUID,
    day_number: int,
    body: DayActivitiesReorderRequest,
    session: AsyncSession = Depends(get_session),
) -> ItineraryResponse:
    """Reorder a day's activities without re-running the LLM (idempotent).

    ``body.order`` is a permutation of the day's current activity indices; the
    server rearranges its own activity objects to match (it never trusts client
    content), re-normalizes, persists the edit in place, and returns the updated
    :class:`ItineraryResponse`. Applying the same order twice yields the same
    stored result, so the operation is idempotent. 404 if the itinerary is
    missing/soft-deleted, the day does not exist, or ``order`` is not a valid
    permutation of the day's activities (wrong length, duplicates, or an index
    out of range). Carries the write rate limit.
    """

    def _reorder(activities: list[Activity]) -> list[Activity]:
        order = body.order
        valid = sorted(order) == list(range(len(activities)))
        if not valid:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "activity_index_out_of_range"},
            )
        return [activities[i] for i in order]

    return await _edit_day_activities(
        itinerary_id=itinerary_id,
        day_number=day_number,
        session=session,
        mutate=_reorder,
    )


@router.delete(
    "/itineraries/{itinerary_id}/days/{day_number}/activities/{activity_index}",
    response_model=ItineraryResponse,
    dependencies=[Depends(rate_limit)],
)
async def remove_day_activity(
    itinerary_id: UUID,
    day_number: int,
    activity_index: int,
    session: AsyncSession = Depends(get_session),
) -> ItineraryResponse:
    """Remove one activity from a day without re-running the LLM.

    Deletes the activity at ``activity_index`` within the day, re-normalizes
    (so the grand total drops by that activity's cost and the remaining map and
    booking links stay consistent), persists the edit in place, and returns the
    updated :class:`ItineraryResponse`. 404 if the itinerary is
    missing/soft-deleted, the day does not exist, or the index is out of range.
    Carries the write rate limit.
    """

    def _remove(activities: list[Activity]) -> list[Activity]:
        if not 0 <= activity_index < len(activities):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "activity_index_out_of_range"},
            )
        return [a for i, a in enumerate(activities) if i != activity_index]

    return await _edit_day_activities(
        itinerary_id=itinerary_id,
        day_number=day_number,
        session=session,
        mutate=_remove,
    )


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
