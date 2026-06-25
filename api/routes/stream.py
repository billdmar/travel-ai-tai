"""Itinerary streaming router.

Frozen endpoint: ``POST /api/v1/itineraries/stream`` -> ``text/event-stream``.

Emits Server-Sent Events as the itinerary is produced: a sequence of plain-text
progress ``data:`` lines (so the UI looks live on any provider, including the
mock and the Gemini quota-exhausted fallback), and a terminal ``data:`` line
carrying the full ``ItineraryResponse`` JSON. The frozen frontend contract
(``web/src/api/client.ts::streamItinerary``) treats the **last** ``data:`` line
as the final itinerary, so that line is always valid ``ItineraryResponse`` JSON.

Generation reuses :meth:`RecommendationEngine.generate` via the thin
:mod:`api.llm.streaming` adapter, so caching, server-owned normalization, and
persistence behave identically to the non-streaming ``POST /itineraries`` path.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.db import get_session
from api.llm.streaming import stream_itinerary
from api.models import ErrorResponse, ItineraryResponse, TravelPreferences
from api.recommend import (
    ItineraryParseError,
    LLMUnavailableError,
    RecommendationEngine,
)

logger = logging.getLogger("tai.stream")

router = APIRouter(prefix="/api/v1", tags=["stream"])


def _engine(request: Request) -> RecommendationEngine:
    return request.app.state.engine


def _error_event(code: str) -> str:
    """Serialize an in-band SSE error payload, validated against the schema.

    Status is already 200 once streaming has started, so failures must travel
    in-band as a ``data:`` line. Routing the payload through
    :class:`~api.models.ErrorResponse` (the same envelope the non-streaming
    routes document) guarantees a malformed error event can never silently
    ship — and ``exclude_none`` keeps the wire body byte-identical to the
    historical ``{"error": "<code>"}`` the frozen client expects.
    """
    return json.dumps(ErrorResponse(error=code).model_dump(exclude_none=True))


def _sse(data: str) -> str:
    """Encode ``data`` as a single SSE ``data:`` event.

    Each line of ``data`` is prefixed (per the SSE spec multi-line rule) and the
    event is terminated by a blank line.
    """
    body = "".join(f"data: {line}\n" for line in (data.splitlines() or [""]))
    return f"{body}\n"


async def _event_source(
    engine: RecommendationEngine,
    prefs: TravelPreferences,
    session: AsyncSession,
) -> AsyncIterator[str]:
    """Produce the SSE byte stream for one generation request.

    Progress strings are sent as plain-text ``data:`` events; the terminal
    ``ItineraryResponse`` is serialized to JSON as the final ``data:`` event so
    it round-trips through ``JSON.parse`` on the client. LLM failures are
    surfaced mid-stream as an ``error`` JSON event (the HTTP status is already
    200 once streaming starts, so errors must travel in-band).
    """
    try:
        async for item in stream_itinerary(engine, prefs, session):
            if isinstance(item, ItineraryResponse):
                # Terminal event: the full itinerary as JSON (the client parses
                # the last data line as ItineraryResponse). It is already a
                # validated model, so ``model_dump_json`` is schema-correct by
                # construction.
                yield _sse(item.model_dump_json())
            else:
                # Progress events are plain-text strings by contract; assert the
                # declared shape so a non-str chunk can't silently ship past the
                # frozen ``onChunk`` callback.
                if not isinstance(item, str):  # pragma: no cover - defensive
                    raise TypeError(
                        f"progress chunk must be str, got {type(item).__name__}"
                    )
                yield _sse(item)
    except LLMUnavailableError as exc:
        logger.warning("stream llm_unavailable: %s", exc)
        yield _sse(_error_event("llm_unavailable"))
    except ItineraryParseError as exc:
        logger.warning("stream itinerary_parse_failed: %s", exc)
        yield _sse(_error_event("itinerary_parse_failed"))


@router.post(
    "/itineraries/stream",
    responses={
        422: {
            "model": ErrorResponse,
            "description": "Invalid travel preferences (rejected before streaming).",
        },
    },
)
async def stream_itinerary_endpoint(
    request: Request,
    preferences: TravelPreferences,
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """Stream a personalized itinerary as Server-Sent Events.

    Returns ``text/event-stream``; the final event carries the full
    ``ItineraryResponse`` JSON. Once the 200 stream has started, provider
    failures arrive in-band as an :class:`~api.models.ErrorResponse` ``data:``
    event (``llm_unavailable`` / ``itinerary_parse_failed``) rather than an HTTP
    error status.
    """
    engine = _engine(request)
    return StreamingResponse(
        _event_source(engine, preferences, session),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
