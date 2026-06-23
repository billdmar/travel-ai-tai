"""Itinerary export endpoint + renderer tests.

Covers the frozen contract
``GET /api/v1/itineraries/{id}/export?format=markdown|pdf``:

* markdown download — content-type, attachment filename, FTC disclosure,
  destination / per-day activities / map + booking links present;
* pdf download — real PDF bytes when ``fpdf2`` is installed (skipped if not);
* 404 for a missing/soft-deleted itinerary;
* 422 for an unsupported ``format``;
* the pure renderers in ``api.export`` exercised directly.
"""

from __future__ import annotations

import importlib.util

import pytest

from api.export import FTC_DISCLOSURE, render_markdown
from api.models import ItineraryResponse

# fpdf2 is an optional/prod dependency; skip PDF byte assertions if absent.
_HAS_FPDF = importlib.util.find_spec("fpdf") is not None


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


async def test_export_markdown_download(client) -> None:
    created = await _create(client)
    resp = await client.get(f"/api/v1/itineraries/{created['id']}/export?format=markdown")

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/markdown")
    assert "attachment" in resp.headers["content-disposition"]
    assert resp.headers["content-disposition"].endswith('.md"')

    body = resp.text
    # Destination header, a per-day section, and the FTC disclosure footer.
    assert "# Tokyo, Japan" in body
    assert "### Day 1" in body
    assert FTC_DISCLOSURE in body
    # Server-owned map links survive into the export.
    assert "https://www.google.com/maps/search/" in body


async def test_export_defaults_to_markdown(client) -> None:
    created = await _create(client)
    resp = await client.get(f"/api/v1/itineraries/{created['id']}/export")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/markdown")


async def test_export_filename_slugged_from_destination(client) -> None:
    created = await _create(client)
    resp = await client.get(f"/api/v1/itineraries/{created['id']}/export?format=markdown")
    assert 'filename="tokyo-japan-itinerary.md"' in resp.headers["content-disposition"]


@pytest.mark.skipif(not _HAS_FPDF, reason="fpdf2 not installed")
async def test_export_pdf_download(client) -> None:
    created = await _create(client)
    resp = await client.get(f"/api/v1/itineraries/{created['id']}/export?format=pdf")

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.headers["content-disposition"].endswith('.pdf"')
    # A real PDF starts with the %PDF- magic header.
    assert resp.content[:5] == b"%PDF-"
    assert len(resp.content) > 500


async def test_export_missing_returns_404(client) -> None:
    resp = await client.get(
        "/api/v1/itineraries/00000000-0000-0000-0000-000000000000/export"
    )
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"] == "itinerary_not_found"


async def test_export_soft_deleted_returns_404(client) -> None:
    created = await _create(client)
    iid = created["id"]
    assert (await client.delete(f"/api/v1/itineraries/{iid}")).status_code == 204
    resp = await client.get(f"/api/v1/itineraries/{iid}/export?format=markdown")
    assert resp.status_code == 404


async def test_export_bad_format_returns_422(client) -> None:
    created = await _create(client)
    resp = await client.get(f"/api/v1/itineraries/{created['id']}/export?format=docx")
    assert resp.status_code == 422


# ── direct renderer unit coverage ───────────────────────────────────────────


def _sample_itinerary() -> ItineraryResponse:
    return ItineraryResponse.model_validate(
        {
            "id": "11111111-1111-1111-1111-111111111111",
            "created_at": "2026-07-01T00:00:00Z",
            "preferences": _payload(),
            "days": [
                {
                    "day_number": 1,
                    "date": "2026-07-01",
                    "theme": "Arrival & food",
                    "activities": [
                        {
                            "time": "09:00",
                            "place": "Tsukiji Market",
                            "description": "Breakfast sushi.",
                            "estimated_cost_usd": 25.0,
                            "category": "food",
                            "map_url": "https://www.google.com/maps/search/?api=1&query=Tsukiji",
                            "booking_url": "https://example.com/book",
                        }
                    ],
                }
            ],
            "total_estimated_cost_usd": 25.0,
            "currency": "USD",
            "summary": "A short trip.",
            "tips": ["Carry cash."],
            "provider": "mock",
        }
    )


def test_render_markdown_contains_links_and_disclosure() -> None:
    md = render_markdown(_sample_itinerary())
    assert "# Tokyo, Japan" in md
    assert "Tsukiji Market" in md
    assert "[Map](https://www.google.com/maps/search/?api=1&query=Tsukiji)" in md
    assert "[Book](https://example.com/book)" in md
    assert "## Tips" in md
    assert FTC_DISCLOSURE in md


@pytest.mark.skipif(not _HAS_FPDF, reason="fpdf2 not installed")
def test_render_pdf_returns_pdf_bytes() -> None:
    from api.export import render_pdf

    out = render_pdf(_sample_itinerary())
    assert isinstance(out, bytes)
    assert out[:5] == b"%PDF-"
