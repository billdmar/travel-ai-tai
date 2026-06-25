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

from api.export import FTC_DISCLOSURE, render_ics, render_markdown
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


async def test_export_ics_download(client) -> None:
    created = await _create(client)
    resp = await client.get(f"/api/v1/itineraries/{created['id']}/export?format=ics")

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/calendar")
    assert "attachment" in resp.headers["content-disposition"]
    assert resp.headers["content-disposition"].endswith('.ics"')

    body = resp.text
    # A well-formed VCALENDAR envelope with at least one event.
    assert "BEGIN:VCALENDAR" in body
    assert "VERSION:2.0" in body
    assert "BEGIN:VEVENT" in body
    assert body.rstrip().endswith("END:VCALENDAR")
    # RFC 5545 mandates CRLF line endings.
    assert "\r\n" in body


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


@pytest.mark.skipif(not _HAS_FPDF, reason="fpdf2 not installed")
def test_render_pdf_is_multipage_premium_artifact() -> None:
    """The polished PDF is a real multi-section document, not a flat text dump.

    A 2-day sample yields: cover + 2 day pages + cost-summary + packing = 5
    pages. fpdf2 writes one ``/Type /Page`` object per page (the page *tree* is
    ``/Type /Pages``), so counting the singular form gives the page count.
    """
    from api import export

    export._PDF_CACHE.clear()  # other tests render the same sample id (cache key)
    itinerary = _sample_itinerary()
    # Add a second day so we exercise multiple day spreads.
    itinerary.days.append(
        ItineraryResponse.model_validate(
            {
                "id": "11111111-1111-1111-1111-111111111111",
                "created_at": "2026-07-01T00:00:00Z",
                "preferences": _payload(),
                "days": [
                    {
                        "day_number": 2,
                        "date": "2026-07-02",
                        "theme": "Temples",
                        "activities": [
                            {
                                "time": "10:00",
                                "place": "Senso-ji",
                                "description": "Temple visit.",
                                "estimated_cost_usd": 0.0,
                                "category": "attraction",
                                "map_url": "https://maps.example/senso",
                            }
                        ],
                    }
                ],
                "total_estimated_cost_usd": 25.0,
                "currency": "USD",
                "summary": "Two days.",
                "tips": [],
                "provider": "mock",
            }
        ).days[0]
    )

    out = export.render_pdf(itinerary)
    assert out[:5] == b"%PDF-"
    # Comfortably larger than the old flat text dump.
    assert len(out) > 2000
    # Cover + 2 days + cost + packing == 5 page objects.
    page_count = out.count(b"/Type /Page\n") + out.count(b"/Type /Page ")
    assert page_count == 5
    # Destination text survives into the (uncompressed) content stream.
    assert b"Tokyo" in out


@pytest.mark.skipif(not _HAS_FPDF, reason="fpdf2 not installed")
def test_render_pdf_caches_per_itinerary_id() -> None:
    """A second render of the same itinerary id returns the cached bytes."""
    from api import export

    itinerary = _sample_itinerary()
    export._PDF_CACHE.clear()
    first = export.render_pdf(itinerary)
    second = export.render_pdf(itinerary)
    # Same object identity proves the cache short-circuited the re-render.
    assert first is second
    assert str(itinerary.id) in export._PDF_CACHE


def test_packing_groups_mirror_frontend_rules() -> None:
    """``_packing_groups`` ports web/src/components/PackingChecklist.tsx exactly.

    Asserts the season-, travel-style-, group-, accessibility-, dietary-, and
    activity-category-driven branches so the server-rendered checklist matches
    what the UI shows.
    """
    from api.export import _packing_groups

    itinerary = ItineraryResponse.model_validate(
        {
            "id": "33333333-3333-3333-3333-333333333333",
            "created_at": "2026-07-01T00:00:00Z",
            # July start -> summer; luxury + group + needs all add items.
            "preferences": _payload(
                start_date="2026-07-01",
                end_date="2026-07-02",
                travel_style="luxury",
                group_size=3,
                accessibility_needs=["step-free access"],
                dietary_needs=["vegetarian"],
            ),
            "days": [
                {
                    "day_number": 1,
                    "date": "2026-07-01",
                    "theme": "Mix",
                    "activities": [
                        {
                            "time": "09:00",
                            "place": "Beach",
                            "description": "Swim.",
                            "estimated_cost_usd": 0.0,
                            "category": "leisure",
                            "map_url": "https://m/1",
                        },
                        {
                            "time": "12:00",
                            "place": "Cafe",
                            "description": "Lunch.",
                            "estimated_cost_usd": 20.0,
                            "category": "food",
                            "map_url": "https://m/2",
                        },
                    ],
                }
            ],
            "total_estimated_cost_usd": 20.0,
            "currency": "USD",
            "summary": "s",
            "tips": [],
            "provider": "mock",
        }
    )

    groups = dict(_packing_groups(itinerary))
    assert list(groups) == [
        "Essentials",
        "Clothing",
        "Health & comfort",
        "For your activities",
    ]
    # group_size > 1 adds the shared-bookings essential.
    assert "Shared copies of bookings for the group" in groups["Essentials"]
    # Summer + luxury clothing branches.
    assert "Sun hat and sunglasses" in groups["Clothing"]
    assert "A smart outfit for upscale dining or venues" in groups["Clothing"]
    # Accessibility need echoed verbatim.
    assert "Accessibility: step-free access" in groups["Health & comfort"]
    # Activity-category + dietary extras.
    assert "Swimwear and a quick-dry towel" in groups["For your activities"]
    assert "Reservation confirmations for dining" in groups["For your activities"]
    assert "Dietary note to show: vegetarian" in groups["For your activities"]


def test_packing_groups_winter_omits_activity_group_when_empty() -> None:
    """No activity-driven items -> the 'For your activities' group is dropped."""
    from api.export import _packing_groups

    itinerary = ItineraryResponse.model_validate(
        {
            "id": "44444444-4444-4444-4444-444444444444",
            "created_at": "2026-01-01T00:00:00Z",
            # January start -> winter; budget style; only an 'other' activity so
            # none of the category-driven extras fire.
            "preferences": _payload(start_date="2026-01-01", end_date="2026-01-02"),
            "days": [
                {
                    "day_number": 1,
                    "date": "2026-01-01",
                    "theme": "Quiet",
                    "activities": [
                        {
                            "time": "09:00",
                            "place": "Walk",
                            "description": "Stroll.",
                            "estimated_cost_usd": 0.0,
                            "category": "other",
                            "map_url": "https://m/1",
                        }
                    ],
                }
            ],
            "total_estimated_cost_usd": 0.0,
            "currency": "USD",
            "summary": "s",
            "tips": [],
            "provider": "mock",
        }
    )

    groups = dict(_packing_groups(itinerary))
    assert "For your activities" not in groups
    assert "Gloves, hat and scarf" in groups["Clothing"]


# ── ICS renderer unit coverage ──────────────────────────────────────────────


def _parse_ics(text: str) -> list[dict[str, str]]:
    """Minimal RFC 5545 parser: unfold lines, return the list of VEVENT dicts.

    Unfolds continuation lines (lines beginning with a space) and collects each
    ``NAME[;params]:value`` pair occurring between BEGIN:VEVENT / END:VEVENT.
    """
    # Unfold: a CRLF followed by a single space/tab is a continuation.
    unfolded = text.replace("\r\n ", "").replace("\r\n\t", "")
    events: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    for raw in unfolded.split("\r\n"):
        if not raw:
            continue
        if raw == "BEGIN:VEVENT":
            current = {}
        elif raw == "END:VEVENT":
            assert current is not None
            events.append(current)
            current = None
        elif current is not None:
            name, _, value = raw.partition(":")
            current[name.split(";", 1)[0]] = value
    return events


def test_render_ics_parses_as_vcalendar_with_one_vevent_per_activity() -> None:
    ics = render_ics(_sample_itinerary())
    # Envelope and trailing CRLF.
    assert ics.startswith("BEGIN:VCALENDAR\r\n")
    assert ics.endswith("END:VCALENDAR\r\n")

    events = _parse_ics(ics)
    # The sample has a single day with a single activity.
    assert len(events) == 1
    event = events[0]
    assert event["SUMMARY"] == "09:00 Tsukiji Market"
    # Commas in the destination are escaped per §3.3.11 (Tokyo\,Japan).
    assert event["LOCATION"] == "Tsukiji Market\\, Tokyo\\, Japan"
    assert event["DTSTART"] == "20260701"
    # Date-based events are inclusive→exclusive: DTEND is the following day.
    assert event["DTEND"] == "20260702"
    # Stable UID anchored to the day + the export domain.
    assert event["UID"].endswith("@travel-ai.tai")
    assert "DTSTAMP" in event


def test_render_ics_escapes_special_text() -> None:
    itinerary = _sample_itinerary()
    # Inject commas/semicolons/newlines that MUST be escaped per §3.3.11.
    itinerary.days[0].activities[0].place = "Cafe, Bar; Grill"
    itinerary.days[0].activities[0].description = "Line one\nLine two"
    ics = render_ics(itinerary)

    # Raw (unparsed) output carries the escapes; parsing strips none of them
    # because the comma/semicolon/newline live inside the value, not as params.
    assert "Cafe\\, Bar\\; Grill" in ics
    assert "Line one\\nLine two" in ics


def test_render_ics_emits_one_event_per_activity_across_days() -> None:
    itinerary = _sample_itinerary()
    # Add a second day with two activities -> 1 + 2 = 3 events total.
    itinerary.days.append(
        ItineraryResponse.model_validate(
            {
                "id": "11111111-1111-1111-1111-111111111111",
                "created_at": "2026-07-01T00:00:00Z",
                "preferences": _payload(),
                "days": [
                    {
                        "day_number": 2,
                        "date": "2026-07-02",
                        "theme": "Temples",
                        "activities": [
                            {
                                "time": "10:00",
                                "place": "Senso-ji",
                                "description": "Temple visit.",
                                "estimated_cost_usd": 0.0,
                                "category": "attraction",
                                "map_url": "https://maps.example/senso",
                            },
                            {
                                "time": "14:00",
                                "place": "Ueno Park",
                                "description": "Stroll.",
                                "estimated_cost_usd": 0.0,
                                "category": "leisure",
                                "map_url": "https://maps.example/ueno",
                            },
                        ],
                    }
                ],
                "total_estimated_cost_usd": 25.0,
                "currency": "USD",
                "summary": "Two days.",
                "tips": [],
                "provider": "mock",
            }
        ).days[0]
    )
    assert len(_parse_ics(render_ics(itinerary))) == 3


def test_render_ics_multibyte_title_has_no_space_only_continuation_lines() -> None:
    """Folding a multi-byte (emoji/CJK) title must not emit space-only lines.

    Regression: ``_fold_line`` cuts on 75/74-octet boundaries that can land
    mid-character. A continuation chunk whose only bytes are an incomplete
    UTF-8 sequence used to decode to ``""`` and still be appended as ``" "``
    (space + empty), producing a space-only continuation line that violates
    RFC 5545 §3.1. We assert no folded line is space-only and the calendar
    still re-parses with one VEVENT per activity.
    """
    itinerary = _sample_itinerary()
    # A long emoji-laden place name forces a >75-octet content line whose folds
    # land on 4-byte emoji boundaries — the exact case that bred the empty chunk.
    itinerary.days[0].activities[0].place = "Sushi " + "🍣" * 30
    ics = render_ics(itinerary)

    # No physical line may be a single space (a space-only continuation line).
    for line in ics.split("\r\n"):
        assert line != " ", "found a space-only continuation line"
        # A continuation line is a space followed by payload; that payload must
        # be non-empty (otherwise the line carries no folded content).
        if line.startswith(" "):
            assert line[1:] != "", "continuation line has empty payload"

    # And the folded output still re-parses as one VEVENT for the one activity.
    events = _parse_ics(ics)
    assert len(events) == 1
    # The unfolded SUMMARY round-trips the emoji intact (no dropped code points).
    assert "🍣" in events[0]["SUMMARY"]
