"""Tests for the optional ``lat``/``lng`` coordinates on the Activity model.

These coordinates drive the interactive Leaflet map view on the frontend. They
are optional so that (a) the LLM may omit them when it doesn't know a place's
location and (b) itineraries persisted before the field existed still validate.
The mock provider emits plausible coords so the map demo and tests have pins.
"""

from __future__ import annotations

from api.llm.mock_provider import build_mock_itinerary
from api.models import Activity, GeneratedItinerary


def _base_activity_kwargs() -> dict:
    """Minimal valid Activity payload without coords."""
    return {
        "time": "09:00",
        "place": "Fushimi Inari Shrine",
        "description": "Walk the torii gates at dawn.",
        "estimated_cost_usd": 0.0,
        "category": "attraction",
        "map_url": "https://www.openstreetmap.org/search?query=Fushimi+Inari",
    }


def test_activity_round_trips_lat_lng() -> None:
    """An Activity accepts numeric lat/lng and preserves them verbatim."""
    activity = Activity(**_base_activity_kwargs(), lat=34.9671, lng=135.7727)
    assert activity.lat == 34.9671
    assert activity.lng == 135.7727
    # Survives a serialize → re-parse cycle (the JSON-blob persistence path).
    reparsed = Activity.model_validate(activity.model_dump())
    assert reparsed.lat == 34.9671
    assert reparsed.lng == 135.7727


def test_activity_validates_without_coords() -> None:
    """Coords default to None so legacy stored itineraries still validate."""
    activity = Activity(**_base_activity_kwargs())
    assert activity.lat is None
    assert activity.lng is None


def test_mock_itinerary_emits_coords_for_every_activity() -> None:
    """Every mock activity carries numeric coords so the map demo has pins."""
    generated = GeneratedItinerary.model_validate(
        build_mock_itinerary(destination="Kyoto, Japan", num_days=3)
    )
    activities = [a for day in generated.days for a in day.activities]
    assert activities  # sanity: the mock produced content
    for activity in activities:
        assert isinstance(activity.lat, float)
        assert isinstance(activity.lng, float)
        assert -90.0 <= activity.lat <= 90.0
        assert -180.0 <= activity.lng <= 180.0


def test_mock_coords_are_deterministic_across_calls() -> None:
    """Coords are reproducible (stable digest, not the salted built-in hash)."""
    first = build_mock_itinerary(destination="Lisbon, Portugal", num_days=2)
    second = build_mock_itinerary(destination="Lisbon, Portugal", num_days=2)
    coords = lambda it: [  # noqa: E731 - tiny local extractor keeps the assert readable
        (a["lat"], a["lng"]) for day in it["days"] for a in day["activities"]
    ]
    assert coords(first) == coords(second)
