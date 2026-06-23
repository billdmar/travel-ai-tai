"""Itinerary export router (FOUNDATION stub).

Frozen endpoint: GET /api/v1/itineraries/{id}/export?format=markdown|pdf
BE-EXPORT fills the handler with real file-download rendering. Until then it
returns 501 so the app boots and the contract is reserved.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/api/v1", tags=["export"])


@router.get("/itineraries/{itinerary_id}/export")
async def export_itinerary(
    itinerary_id: str,
    format: Literal["markdown", "pdf"] = "markdown",
) -> None:
    """Stub: BE-EXPORT returns a file download here."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="export not implemented yet",
    )
