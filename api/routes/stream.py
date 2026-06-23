"""Itinerary streaming router (FOUNDATION stub).

Frozen endpoint: POST /api/v1/itineraries/stream -> text/event-stream
BE-STREAM fills the handler with SSE generation (mock-stream fallback). Until
then it returns 501.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/api/v1", tags=["stream"])


@router.post("/itineraries/stream")
async def stream_itinerary() -> None:
    """Stub: BE-STREAM returns a text/event-stream here."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="streaming not implemented yet",
    )
