"""Shared HTTP-layer helpers for the route handlers.

Centralizes the two pieces of error-mapping boilerplate that otherwise repeat
verbatim across the route modules:

* :func:`get_itinerary_or_404` — the "load a live itinerary record or raise the
  shared 404 envelope" lookup used by the retrieval/export/edit handlers.
* :func:`raise_llm_unavailable` / :func:`raise_itinerary_parse_failed` — the
  fixed :class:`~api.recommend.LLMUnavailableError` / ``ItineraryParseError`` ->
  ``HTTPException`` translations (503 with ``Retry-After`` and 502) that the
  generation, regeneration, and discovery handlers each performed inline.

Keeping these here means the status codes, error envelopes, and the
``Retry-After`` hint live in exactly one place, so the routes stay thin and the
wire contract cannot drift between handlers.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, NoReturn
from uuid import UUID

from fastapi import HTTPException, status

from api.db import ItineraryRecord

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


async def get_itinerary_or_404(
    session: AsyncSession, itinerary_id: UUID
) -> ItineraryRecord:
    """Load a live itinerary record by id or raise the shared 404 envelope.

    Returns the :class:`~api.db.ItineraryRecord` for ``itinerary_id`` when it
    exists and has not been soft-deleted. A missing or soft-deleted row raises
    ``HTTPException(404, {"error": "itinerary_not_found"})`` — the single
    not-found contract every itinerary-keyed handler shares.
    """
    record = await session.get(ItineraryRecord, str(itinerary_id))
    if record is None or record.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "itinerary_not_found"},
        )
    return record


def raise_llm_unavailable() -> NoReturn:
    """Raise the shared ``503`` for an unreachable LLM provider.

    Carries the ``{"error": "llm_unavailable"}`` envelope and a ``Retry-After``
    hint so clients back off uniformly across the generation, regeneration, and
    discovery paths. Typed ``NoReturn`` so callers can use it as a tail
    statement without confusing the type checker about control flow.
    """
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={"error": "llm_unavailable"},
        headers={"Retry-After": "60"},
    )


def raise_itinerary_parse_failed() -> NoReturn:
    """Raise the shared ``502`` for LLM output that failed schema validation.

    Carries the ``{"error": "itinerary_parse_failed"}`` envelope used by the
    generation and regeneration paths when the model returns unparseable output.
    """
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail={"error": "itinerary_parse_failed"},
    )
