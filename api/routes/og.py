"""Dynamic Open Graph image router (BE-OG).

Frozen endpoint:
    GET /api/v1/itineraries/{id}/og-image -> image/png (1200x630)

Renders a clean typographic share card for an itinerary — the destination title,
a one-line subtitle (``N days · budget tier · pace``), and a small "Travel AI"
wordmark — drawn with Pillow in the site's brand palette (see ``web/tailwind.config``:
``canvas`` background, ``ink`` text, ``accent`` rule). No remote photo is fetched:
the card is purely typographic so this route stays self-contained and never
couples to the Unsplash proxy.

1200x630 is the Open Graph / Twitter recommended share-image size, so the meta
tags in ``index.html`` / ``SharePage`` advertise those exact dimensions.

404 when the itinerary is missing or soft-deleted. Each rendered PNG is cached
~1h per id (the card is deterministic for a given stored itinerary), using the
shared :class:`api.cache.AsyncTTLCache` with this route's own cache instance so
it never shares state with :mod:`api.routes.images`.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.cache import AsyncTTLCache
from api.db import ItineraryRecord, get_session
from api.recommend import record_to_response

if TYPE_CHECKING:
    from fastapi import FastAPI

    from api.models import ItineraryResponse

router = APIRouter(prefix="/api/v1", tags=["og"])

# ── Card geometry (Open Graph recommended share size) ───────────────────────
_OG_WIDTH = 1200
_OG_HEIGHT = 630
#: Generous left/right margin so text never crowds the edge on a small preview.
_MARGIN = 80
#: Type sizes (px). Named constants so the line-height math below stays in sync
#: with the headline font without reaching for ``font.size`` (whose type the
#: scalable/bitmap font union obscures).
_TITLE_SIZE = 84
_SUBTITLE_SIZE = 36
_WORDMARK_SIZE = 30
_TAGLINE_SIZE = 22

# ── Brand palette (hexes copied from web/tailwind.config) ────────────────────
#: ``canvas.DEFAULT`` — warm off-white page background.
_CANVAS = (250, 248, 244)
#: ``ink.DEFAULT`` — warm charcoal for the headline.
_INK = (43, 42, 40)
#: ``ink.soft`` — secondary text for the subtitle.
_INK_SOFT = (85, 82, 77)
#: ``ink.faint`` — captions/credits (the wordmark tagline).
_INK_FAINT = (138, 133, 125)
#: ``accent.500`` — the single accent, used for the rule + wordmark.
_ACCENT = (63, 122, 114)

#: How long a rendered card stays warm. The card is deterministic per stored
#: itinerary, so an hour collapses the repeated crawler/preview hits a single
#: shared link produces without pinning a card forever.
_CACHE_TTL_SECONDS = 3600
#: Bound the cache so a long tail of distinct ids can't grow it unbounded.
_CACHE_MAX_SIZE = 256

#: Human-readable label per ``travel_style`` for the subtitle's budget tier.
_BUDGET_TIER = {
    "budget": "Budget",
    "midrange": "Mid-range",
    "luxury": "Luxury",
}


#: Guards lazy, race-free creation of the per-app cache (see ``_cache_for``).
_INIT_LOCK = asyncio.Lock()


async def _cache_for(app: FastAPI) -> AsyncTTLCache[bytes]:
    """Return the app's OG cache (itinerary id -> PNG bytes), creating it on first use.

    The cache lives on ``app.state`` (not a module global) so each app built in
    a test gets its own — preserving the suite's per-test isolation — while
    production shares one instance across requests.
    """
    cache = getattr(app.state, "og_cache", None)
    if cache is None:
        async with _INIT_LOCK:
            cache = getattr(app.state, "og_cache", None)
            if cache is None:
                cache = AsyncTTLCache[bytes](
                    maxsize=_CACHE_MAX_SIZE, ttl=_CACHE_TTL_SECONDS
                )
                app.state.og_cache = cache
    return cache


def _subtitle(itinerary: ItineraryResponse) -> str:
    """One-line trip summary: ``N days · budget tier · relaxed/moderate/packed``."""
    prefs = itinerary.preferences
    days = prefs.trip_length_days
    day_word = "day" if days == 1 else "days"
    tier = _BUDGET_TIER.get(prefs.travel_style, prefs.travel_style.title())
    pace = prefs.pace.title()
    return f"{days} {day_word}  ·  {tier}  ·  {pace}"


def _render_card(itinerary: ItineraryResponse) -> bytes:
    """Draw the 1200x630 typographic share card and return PNG bytes.

    Pillow is imported lazily so the route module stays importable even in a
    deployment that somehow lacks the wheel — though it is pinned in
    ``requirements.txt`` and present in every real build/test environment.
    ``ImageFont.load_default(size=...)`` yields a scalable built-in font, so we
    need no bundled ``.ttf`` files to size the headline vs. the subtitle.
    """
    from io import BytesIO

    from PIL import Image, ImageDraw, ImageFont

    image = Image.new("RGB", (_OG_WIDTH, _OG_HEIGHT), _CANVAS)
    draw = ImageDraw.Draw(image)

    title_font = ImageFont.load_default(size=_TITLE_SIZE)
    subtitle_font = ImageFont.load_default(size=_SUBTITLE_SIZE)
    wordmark_font = ImageFont.load_default(size=_WORDMARK_SIZE)

    # ── Headline: the destination, wrapped to fit the content width ──────────
    destination = itinerary.preferences.destination
    max_text_width = _OG_WIDTH - 2 * _MARGIN
    lines = _wrap(destination, title_font, max_text_width, draw)

    # Vertically center the title block in the upper two-thirds of the card.
    line_height = _TITLE_SIZE + 16
    block_height = line_height * len(lines)
    y = (_OG_HEIGHT - block_height) // 2 - 40
    for line in lines:
        draw.text((_MARGIN, y), line, font=title_font, fill=_INK)
        y += line_height

    # ── Accent rule + subtitle directly beneath the headline block ───────────
    rule_y = y + 12
    draw.rectangle((_MARGIN, rule_y, _MARGIN + 120, rule_y + 4), fill=_ACCENT)
    draw.text(
        (_MARGIN, rule_y + 24),
        _subtitle(itinerary),
        font=subtitle_font,
        fill=_INK_SOFT,
    )

    # ── Wordmark pinned to the bottom-left corner ────────────────────────────
    wordmark_y = _OG_HEIGHT - _MARGIN
    draw.text((_MARGIN, wordmark_y), "Travel AI", font=wordmark_font, fill=_ACCENT)
    draw.text(
        (_MARGIN + 140, wordmark_y + 4),
        "personalized trips, planned by AI",
        font=ImageFont.load_default(size=_TAGLINE_SIZE),
        fill=_INK_FAINT,
    )

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _wrap(text: str, font, max_width: int, draw) -> list[str]:  # noqa: ANN001
    """Greedy word-wrap ``text`` to at most two lines within ``max_width``.

    A destination is short ("Tokyo, Japan"), so two lines is ample; if it still
    overflows we truncate the second line with an ellipsis rather than spill off
    the card. Width is measured with the real font via ``textbbox``.
    """

    def width(s: str) -> int:
        bbox = draw.textbbox((0, 0), s, font=font)
        return bbox[2] - bbox[0]

    words = text.split()
    if not words:
        return [text]

    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if width(candidate) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)

    if len(lines) <= 2:
        return lines

    # Collapse the overflow into the second line, truncating with an ellipsis.
    second = lines[1]
    while second and width(f"{second}…") > max_width:
        second = second[:-1]
    return [lines[0], f"{second}…" if second else "…"]


@router.get("/itineraries/{itinerary_id}/og-image")
async def itinerary_og_image(
    itinerary_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Return a 1200x630 PNG Open Graph card for an itinerary.

    404 if the itinerary is missing or soft-deleted. The rendered PNG is cached
    ~1h per id, so repeated crawler/preview hits on a shared link reuse the same
    bytes instead of re-rendering.
    """
    key = str(itinerary_id)
    cache = await _cache_for(request.app)

    cached = await cache.get(key)
    if cached is not None:
        return Response(content=cached, media_type="image/png")

    record = await session.get(ItineraryRecord, key)
    if record is None or record.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "itinerary_not_found"},
        )

    png = _render_card(record_to_response(record))
    await cache.set(key, png)
    return Response(content=png, media_type="image/png")
