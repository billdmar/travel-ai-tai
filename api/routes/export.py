"""Itinerary export router (BE-EXPORT).

Frozen endpoint:
    GET /api/v1/itineraries/{id}/export?format=markdown|pdf|ics

Streams the itinerary back as a file download (correct ``Content-Type`` and a
``Content-Disposition: attachment`` filename). 404 when the itinerary is missing
or soft-deleted; 422 for an unsupported ``format``; 503 if PDF is requested but
the optional ``fpdf2`` library is not installed in this deployment. The ``ics``
format (an RFC 5545 calendar) is pure stdlib and so is always available.
"""

from __future__ import annotations

import re
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.db import ItineraryRecord, get_session
from api.export import (
    PDFExportUnavailable,
    render_ics,
    render_markdown,
    render_pdf,
)
from api.ratelimit import rate_limit_export
from api.recommend import record_to_response

router = APIRouter(prefix="/api/v1", tags=["export"])

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slug(destination: str) -> str:
    """Filesystem-safe slug for the download filename (``Tokyo, Japan`` -> ``tokyo-japan``)."""
    slug = _SLUG_RE.sub("-", destination.lower()).strip("-")
    return slug or "itinerary"


@router.get(
    "/itineraries/{itinerary_id}/export",
    dependencies=[Depends(rate_limit_export)],
)
async def export_itinerary(
    itinerary_id: UUID,
    format: Literal["markdown", "pdf", "ics"] = "markdown",
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Download an itinerary as Markdown, PDF, or an ICS calendar.

    The ``format`` query param is validated by FastAPI against the ``Literal``,
    so any other value yields a 422 before this handler runs.
    """
    record = await session.get(ItineraryRecord, str(itinerary_id))
    if record is None or record.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "itinerary_not_found"},
        )

    itinerary = record_to_response(record)
    stem = f"{_slug(itinerary.preferences.destination)}-itinerary"

    if format == "markdown":
        body = render_markdown(itinerary).encode("utf-8")
        media_type = "text/markdown; charset=utf-8"
        filename = f"{stem}.md"
    elif format == "ics":
        body = render_ics(itinerary).encode("utf-8")
        media_type = "text/calendar; charset=utf-8"
        filename = f"{stem}.ics"
    else:  # "pdf" — the Literal guarantees no other value reaches here.
        try:
            body = render_pdf(itinerary)
        except PDFExportUnavailable as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"error": "pdf_export_unavailable"},
            ) from exc
        media_type = "application/pdf"
        filename = f"{stem}.pdf"

    return Response(
        content=body,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
