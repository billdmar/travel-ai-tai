"""Itinerary share router (FOUNDATION stub).

Frozen endpoints:
  POST /api/v1/itineraries/{id}/share -> {token}
  GET  /api/v1/shared/{token}         -> read-only ItineraryResponse
BE-SHARE fills the handlers + DB persistence. Until then they return 501.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/api/v1", tags=["share"])


@router.post("/itineraries/{itinerary_id}/share")
async def create_share_link(itinerary_id: str) -> dict[str, str]:
    """Stub: BE-SHARE persists a token and returns {"token": ...}."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="share not implemented yet",
    )


@router.get("/shared/{token}")
async def get_shared_itinerary(token: str) -> None:
    """Stub: BE-SHARE returns a read-only ItineraryResponse for the token."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="shared lookup not implemented yet",
    )
