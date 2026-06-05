"""Validator tests for the Pydantic models."""

from __future__ import annotations

from datetime import date

import pytest
from pydantic import ValidationError

from api.models import GeneratedItinerary, ItineraryDay, TravelPreferences


def _valid_prefs(**overrides) -> dict:
    base = {
        "destination": "Tokyo, Japan",
        "start_date": date(2026, 7, 1),
        "end_date": date(2026, 7, 4),
        "budget_usd": 2000.0,
        "interests": ["food", "temples"],
    }
    base.update(overrides)
    return base


def test_valid_preferences_pass() -> None:
    prefs = TravelPreferences(**_valid_prefs())
    assert prefs.trip_length_days == 4
    assert prefs.pace == "moderate"


def test_end_before_start_raises() -> None:
    with pytest.raises(ValidationError):
        TravelPreferences(
            **_valid_prefs(start_date=date(2026, 7, 10), end_date=date(2026, 7, 1))
        )


def test_trip_over_30_days_raises() -> None:
    with pytest.raises(ValidationError):
        TravelPreferences(
            **_valid_prefs(start_date=date(2026, 7, 1), end_date=date(2026, 8, 15))
        )


def test_trip_exactly_30_days_passes() -> None:
    prefs = TravelPreferences(
        **_valid_prefs(start_date=date(2026, 7, 1), end_date=date(2026, 7, 30))
    )
    assert prefs.trip_length_days == 30


def test_too_many_interests_raises() -> None:
    with pytest.raises(ValidationError):
        TravelPreferences(**_valid_prefs(interests=[f"i{n}" for n in range(16)]))


def test_generated_itinerary_empty_days_raises() -> None:
    with pytest.raises(ValidationError):
        GeneratedItinerary(
            days=[],
            total_estimated_cost_usd=0.0,
            summary="empty",
            tips=["none"],
        )


def test_generated_itinerary_non_empty_passes() -> None:
    day = ItineraryDay(
        day_number=1,
        date=date(2026, 7, 1),
        theme="Arrival",
        activities=[
            {
                "time": "09:00",
                "place": "Somewhere",
                "description": "Something",
                "estimated_cost_usd": 10.0,
                "category": "attraction",
                "map_url": "https://example.com",
            }
        ],
    )
    itin = GeneratedItinerary(
        days=[day],
        total_estimated_cost_usd=10.0,
        summary="ok",
        tips=["tip"],
    )
    assert len(itin.days) == 1
