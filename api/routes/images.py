"""Server-side Unsplash image proxy under ``/api/v1``.

The frontend asks the server for a destination photo (``GET /images?query=``)
rather than calling Unsplash directly, so the access key never reaches the
browser and we control attribution. The endpoint NEVER raises to the client:
with no key configured — or on any upstream/parse failure — it returns a
``fallback: true`` envelope with null URLs. The frontend then resolves a
curated, bundled ``.webp`` for the query, so itineraries stay photo-rich even
when no ``UNSPLASH_ACCESS_KEY`` is set.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import httpx
from fastapi import APIRouter, Depends, Query, Request

from api.ratelimit import rate_limit_image

if TYPE_CHECKING:
    from api.config import Settings

logger = logging.getLogger("tai.images")

router = APIRouter(prefix="/api/v1", tags=["images"])

_UNSPLASH_SEARCH = "https://api.unsplash.com/search/photos"
#: Fallback timeout when settings carry no HTTP timeout (e.g. in isolation).
_DEFAULT_TIMEOUT_SECONDS = 5.0
#: Cap the query sent upstream — destination/image_query strings are short, and
#: a bound is cheap defence against oversized or malformed input.
_MAX_QUERY_LEN = 120
#: Ask Unsplash for a few candidates so we can prefer a usable landscape photo
#: instead of blindly taking the first (which may lack a ``regular`` URL).
_PER_PAGE = 5


def _fallback(query: str) -> dict:
    """Return the null-URL envelope used when no image is available."""
    return {
        "url": None,
        "thumb_url": None,
        "alt": query,
        "credit": None,
        "fallback": True,
    }


def _first_usable(results: list, query: str) -> dict | None:
    """Pick the first candidate that actually carries a displayable URL.

    Unsplash occasionally returns entries without a ``regular`` URL; skipping
    those yields a photo-rich result more often than blindly taking the first.
    """
    for photo in results:
        if not isinstance(photo, dict):
            continue
        urls = photo.get("urls") or {}
        regular = urls.get("regular")
        if not regular:
            continue
        user = photo.get("user") or {}
        return {
            "url": regular,
            "thumb_url": urls.get("thumb"),
            "alt": photo.get("alt_description") or query,
            "credit": {
                "name": user.get("name"),
                "link": (user.get("links") or {}).get("html"),
            },
            "fallback": False,
        }
    return None


@router.get("/images", dependencies=[Depends(rate_limit_image)])
async def get_image(request: Request, query: str = Query(..., min_length=1)) -> dict:
    """Return a single Unsplash photo for ``query`` (or a fallback envelope).

    Proxies a server-side Unsplash search using the configured access key. With
    no key, or on any failure (network, non-200, empty results, malformed
    payload, or no candidate with a usable URL), returns ``fallback: true`` with
    null URLs — never an error.
    """
    settings: Settings = request.app.state.settings
    key = settings.unsplash_access_key
    if not key:
        return _fallback(query)

    upstream_query = query.strip()[:_MAX_QUERY_LEN] or query
    timeout = getattr(settings, "http_timeout_seconds", None) or _DEFAULT_TIMEOUT_SECONDS

    try:
        async with httpx.AsyncClient(timeout=timeout) as http:
            resp = await http.get(
                _UNSPLASH_SEARCH,
                params={
                    "query": upstream_query,
                    "per_page": _PER_PAGE,
                    "orientation": "landscape",
                },
                headers={"Authorization": f"Client-ID {key}"},
            )
        resp.raise_for_status()
        results = resp.json().get("results") or []
        if not results:
            return _fallback(query)

        usable = _first_usable(results, query)
        return usable if usable is not None else _fallback(query)
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        # Any upstream/parse failure degrades gracefully to a placeholder.
        logger.warning("unsplash_fetch_failed query=%r err=%s", query, exc)
        return _fallback(query)
