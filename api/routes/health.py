"""Liveness endpoint."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Request

if TYPE_CHECKING:
    from api.config import Settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(request: Request) -> dict[str, str]:
    """Return service liveness and version."""
    settings: Settings = request.app.state.settings
    return {"status": "ok", "version": settings.version}
