"""Itinerary share router.

Frozen endpoints:
  POST /api/v1/itineraries/{id}/share -> {"token": ...}
  GET  /api/v1/shared/{token}         -> read-only ItineraryResponse (404 unknown)

Tokens are minted and looked up via :mod:`api.share` and persisted in the DB,
so a generated link survives a process restart. The shared view is read-only:
there is no save/delete here.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.db import get_session
from api.models import ItineraryResponse
from api.share import lookup_share_token, mint_share_token

router = APIRouter(prefix="/api/v1", tags=["share"])


@router.post("/itineraries/{itinerary_id}/share")
async def create_share_link(
    itinerary_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Mint (or reuse) a public share token for an itinerary.

    Returns ``{"token": ...}``; 404 if the itinerary is missing or soft-deleted.
    Idempotent — repeat calls for the same itinerary return the same token.
    """
    token = await mint_share_token(session, str(itinerary_id))
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "itinerary_not_found"},
        )
    return {"token": token}


@router.get("/shared/{token}", response_model=ItineraryResponse)
async def get_shared_itinerary(
    token: str,
    session: AsyncSession = Depends(get_session),
) -> ItineraryResponse:
    """Return the read-only itinerary for a share token (404 if unknown)."""
    response = await lookup_share_token(session, token)
    if response is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "share_token_not_found"},
        )
    return response
