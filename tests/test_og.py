"""Dynamic Open Graph image endpoint tests.

Covers ``GET /api/v1/itineraries/{id}/og-image``:

* a real itinerary renders a non-trivial ``image/png`` (a valid 1200x630 PNG);
* an unknown / soft-deleted id is a 404 with the shared error envelope;
* the second request for the same id is served from the in-process cache
  (asserted both by identical bytes and by observing no second render);
* the pure subtitle / word-wrap helpers exercised directly.
"""

from __future__ import annotations

from io import BytesIO

import pytest
from PIL import Image

from api.models import (
    GeneratedItinerary,
    ItineraryDay,
    ItineraryResponse,
    TravelPreferences,
)
from api.routes import og


@pytest.fixture(autouse=True)
def _mount_og_router(app):
    """Ensure the OG router is registered ahead of the SPA catch-all.

    The ``app`` factory in :mod:`api.main` owns the ``include_router`` line for
    this route (added during integration, alongside the other API routers and
    *before* ``_mount_spa`` — which registers a ``/{full_path:path}`` catch-all
    last). Routes match in registration order, so a router merely appended after
    the catch-all would be shadowed by ``index.html``. We replicate the real
    wiring here by inserting the OG route ahead of that catch-all — keeping these
    tests representative and green without editing a file this lane does not own.
    Guarded against a double-include so it is a no-op once main.py wires it in.
    """
    og_path = og.router.prefix + "/itineraries/{itinerary_id}/og-image"
    if any(getattr(r, "path", None) == og_path for r in app.router.routes):
        return app

    before = len(app.router.routes)
    app.include_router(og.router)
    # ``include_router`` appended the new route(s) at the end (after the SPA
    # catch-all). Lift them to the front so they win the match, mirroring
    # main.py registering API routers before ``_mount_spa``.
    added = app.router.routes[before:]
    del app.router.routes[before:]
    app.router.routes[:0] = added
    return app


def _payload(**overrides) -> dict:
    base = {
        "destination": "Tokyo, Japan",
        "start_date": "2026-07-01",
        "end_date": "2026-07-03",
        "budget_usd": 1500.0,
        "interests": ["food", "temples"],
    }
    base.update(overrides)
    return base


async def _create(client) -> dict:
    resp = await client.post("/api/v1/itineraries", json=_payload())
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_og_image_returns_png(client) -> None:
    created = await _create(client)
    resp = await client.get(f"/api/v1/itineraries/{created['id']}/og-image")

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/png"
    # Non-trivial bytes that decode as a 1200x630 PNG.
    assert len(resp.content) > 1000
    image = Image.open(BytesIO(resp.content))
    assert image.format == "PNG"
    assert image.size == (1200, 630)


async def test_og_image_unknown_id_is_404(client) -> None:
    # A well-formed but unknown UUID — passes the path converter, misses the DB.
    resp = await client.get(
        "/api/v1/itineraries/00000000-0000-0000-0000-000000000000/og-image"
    )
    assert resp.status_code == 404
    assert resp.json() == {"detail": {"error": "itinerary_not_found"}}


async def test_og_image_second_call_served_from_cache(client, monkeypatch) -> None:
    created = await _create(client)
    first = await client.get(f"/api/v1/itineraries/{created['id']}/og-image")
    assert first.status_code == 200

    # After the first (warming) call, any further render would be a bug: the
    # second hit must come from the cache. Spy on the renderer to prove it.
    def _boom(_itinerary):  # pragma: no cover - only runs if the cache misses
        raise AssertionError("render should not run on a cache hit")

    monkeypatch.setattr(og, "_render_card", _boom)

    second = await client.get(f"/api/v1/itineraries/{created['id']}/og-image")
    assert second.status_code == 200
    # Identical bytes confirm the same cached card was served, not a re-render.
    assert second.content == first.content


def _itinerary(**pref_overrides) -> ItineraryResponse:
    prefs = TravelPreferences(**_payload(**pref_overrides))
    generated = GeneratedItinerary(
        days=[
            ItineraryDay(
                day_number=1,
                date=prefs.start_date,
                theme="Arrival",
                activities=[],
            )
        ],
        total_estimated_cost_usd=0.0,
        summary="A short trip.",
        tips=["Pack light."],
    )
    return ItineraryResponse.from_generated(
        id=__import__("uuid").uuid4(),
        created_at=__import__("datetime").datetime(2026, 6, 1),
        preferences=prefs,
        generated=generated,
        provider="mock",
        tokens_used=None,
    )


def test_subtitle_composes_days_tier_and_pace() -> None:
    # 2026-07-01..03 inclusive is 3 days; midrange -> "Mid-range"; moderate pace.
    subtitle = og._subtitle(_itinerary())
    assert "3 days" in subtitle
    assert "Mid-range" in subtitle
    assert "Moderate" in subtitle


def test_subtitle_singular_day_and_luxury_tier() -> None:
    subtitle = og._subtitle(
        _itinerary(end_date="2026-07-01", travel_style="luxury", pace="relaxed")
    )
    assert "1 day" in subtitle
    assert "Luxury" in subtitle
    assert "Relaxed" in subtitle


def test_wrap_truncates_an_overlong_destination() -> None:
    from PIL import ImageDraw, ImageFont

    draw = ImageDraw.Draw(Image.new("RGB", (1200, 630)))
    font = ImageFont.load_default(size=84)
    # A long multi-word destination must collapse to at most two lines.
    text = "Some Extraordinarily Long Destination Name That Cannot Possibly Fit"
    lines = og._wrap(text, font, 1040, draw)
    assert len(lines) <= 2
