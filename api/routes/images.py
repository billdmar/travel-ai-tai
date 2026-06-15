"""Server-side Unsplash image proxy under ``/api/v1``.

The frontend asks the server for a destination photo (``GET /images?query=``)
rather than calling Unsplash directly, so the access key never reaches the
browser and we control attribution. The endpoint NEVER raises to the client:
with no key configured — or on any upstream/parse failure — it returns a
``fallback: true`` envelope with null URLs so the UI can render a placeholder.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import httpx
from fastapi import APIRouter, Query, Request

if TYPE_CHECKING:
    from api.config import Settings

logger = logging.getLogger("tai.images")

router = APIRouter(prefix="/api/v1", tags=["images"])

_UNSPLASH_SEARCH = "https://api.unsplash.com/search/photos"
_TIMEOUT_SECONDS = 5.0


def _fallback(query: str) -> dict:
    """Return the null-URL envelope used when no image is available."""
    return {
        "url": None,
        "thumb_url": None,
        "alt": query,
        "credit": None,
        "fallback": True,
    }


@router.get("/images")
async def get_image(request: Request, query: str = Query(..., min_length=1)) -> dict:
    """Return a single Unsplash photo for ``query`` (or a fallback envelope).

    Proxies a server-side Unsplash search using the configured access key. With
    no key, or on any failure (network, non-200, empty results, malformed
    payload), returns ``fallback: true`` with null URLs — never an error.
    """
    settings: Settings = request.app.state.settings
    key = settings.unsplash_access_key
    if not key:
        return _fallback(query)

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as http:
            resp = await http.get(
                _UNSPLASH_SEARCH,
                params={"query": query, "per_page": 1, "orientation": "landscape"},
                headers={"Authorization": f"Client-ID {key}"},
            )
        resp.raise_for_status()
        results = resp.json().get("results") or []
        if not results:
            return _fallback(query)

        photo = results[0]
        urls = photo.get("urls") or {}
        user = photo.get("user") or {}
        return {
            "url": urls.get("regular"),
            "thumb_url": urls.get("thumb"),
            "alt": photo.get("alt_description") or query,
            "credit": {
                "name": user.get("name"),
                "link": (user.get("links") or {}).get("html"),
            },
            "fallback": False,
        }
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        # Any upstream/parse failure degrades gracefully to a placeholder.
        logger.warning("unsplash_fetch_failed query=%r err=%s", query, exc)
        return _fallback(query)
