"""Property-based tests using Hypothesis for Travel AI models and utilities."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from pydantic import ValidationError

from api.models import (
    Activity,
    GeneratedItinerary,
    ItineraryDay,
    TravelPreferences,
)
from api.recommend import cache_key_for, normalize_generated

# ── Strategies ────────────────────────────────────────────────────────────────

VALID_PACES = ["relaxed", "moderate", "packed"]
VALID_STYLES = ["budget", "midrange", "luxury"]
VALID_CATEGORIES = ["food", "attraction", "transport", "accommodation", "leisure", "other"]


def _build_valid_prefs(
    destination, start_date, trip_days, budget_usd, interests, pace, travel_style, group_size
):
    """Assemble a valid prefs dict from generated components."""
    return {
        "destination": destination,
        "start_date": start_date,
        "end_date": start_date + timedelta(days=trip_days - 1),
        "budget_usd": budget_usd,
        "interests": interests,
        "pace": pace,
        "travel_style": travel_style,
        "group_size": group_size,
    }


def _valid_prefs_strategy() -> st.SearchStrategy[dict]:
    """Generate kwargs dicts that should always produce a valid TravelPreferences."""
    return st.builds(
        _build_valid_prefs,
        destination=st.text(
            alphabet=st.characters(categories=("L", "N", "P", "Z")),
            min_size=1,
            max_size=200,
        ),
        start_date=st.dates(
            min_value=date(2020, 1, 1), max_value=date(2030, 12, 31)
        ),
        trip_days=st.integers(min_value=1, max_value=30),
        budget_usd=st.floats(
            min_value=0.01,
            max_value=1_000_000,
            allow_nan=False,
            allow_infinity=False,
        ),
        interests=st.lists(
            st.text(min_size=1, max_size=50), min_size=0, max_size=15
        ),
        pace=st.sampled_from(VALID_PACES),
        travel_style=st.sampled_from(VALID_STYLES),
        group_size=st.integers(min_value=1, max_value=20),
    )


def _build_invalid_date_prefs(start_date, gap, budget_usd):
    """Assemble a prefs dict where end_date < start_date."""
    return {
        "destination": "Paris",
        "start_date": start_date,
        "end_date": start_date - timedelta(days=gap),
        "budget_usd": budget_usd,
        "interests": [],
        "pace": "moderate",
        "travel_style": "midrange",
        "group_size": 1,
    }


def _invalid_date_prefs_strategy() -> st.SearchStrategy[dict]:
    """Generate kwargs where end_date < start_date (always invalid)."""
    return st.builds(
        _build_invalid_date_prefs,
        start_date=st.dates(
            min_value=date(2020, 1, 2), max_value=date(2030, 12, 31)
        ),
        gap=st.integers(min_value=1, max_value=365),
        budget_usd=st.floats(
            min_value=0.01,
            max_value=1_000_000,
            allow_nan=False,
            allow_infinity=False,
        ),
    )


def _generated_itinerary_strategy() -> st.SearchStrategy[GeneratedItinerary]:
    """Generate a valid GeneratedItinerary with randomized activity costs."""
    activity_st = st.builds(
        Activity,
        time=st.just("10:00"),
        place=st.text(min_size=1, max_size=50),
        description=st.text(min_size=1, max_size=100),
        estimated_cost_usd=st.floats(
            min_value=0.0,
            max_value=10_000.0,
            allow_nan=False,
            allow_infinity=False,
        ),
        category=st.sampled_from(VALID_CATEGORIES),
        map_url=st.just("https://maps.google.com/?q=place"),
    )

    day_st = st.builds(
        ItineraryDay,
        day_number=st.just(1),
        date=st.just(date(2025, 4, 1)),
        theme=st.text(min_size=1, max_size=50),
        activities=st.lists(activity_st, min_size=1, max_size=5),
    )

    return st.builds(
        GeneratedItinerary,
        days=st.lists(day_st, min_size=1, max_size=3),
        total_estimated_cost_usd=st.just(9999.0),  # will be corrected by normalize
        currency=st.just("USD"),
        summary=st.text(min_size=1, max_size=200),
        tips=st.lists(st.text(min_size=1, max_size=100), min_size=1, max_size=5),
    )


# ── Property tests ────────────────────────────────────────────────────────────


class TestTravelPreferencesProperties:
    """Property tests for TravelPreferences validation."""

    @given(prefs=_valid_prefs_strategy())
    @settings(max_examples=50)
    def test_valid_prefs_always_parse(self, prefs: dict) -> None:
        """Any combination of valid inputs must construct without raising."""
        result = TravelPreferences(**prefs)
        assert result.destination == prefs["destination"]
        assert result.start_date == prefs["start_date"]
        assert result.end_date == prefs["end_date"]

    @given(prefs=_invalid_date_prefs_strategy())
    @settings(max_examples=50)
    def test_invalid_date_combos_always_reject(self, prefs: dict) -> None:
        """end_date < start_date must always raise ValidationError."""
        with pytest.raises(ValidationError):
            TravelPreferences(**prefs)


class TestCacheKeyProperties:
    """Property tests for cache_key_for determinism."""

    @given(prefs=_valid_prefs_strategy())
    @settings(max_examples=50)
    def test_cache_key_is_deterministic(self, prefs: dict) -> None:
        """Two identical TravelPreferences instances must produce the same cache key."""
        a = TravelPreferences(**prefs)
        b = TravelPreferences(**prefs)
        assert cache_key_for(a) == cache_key_for(b)


class TestNormalizeGeneratedProperties:
    """Property tests for normalize_generated cost reconciliation."""

    @given(generated=_generated_itinerary_strategy())
    @settings(max_examples=50)
    def test_total_reconciles_after_normalize(self, generated: GeneratedItinerary) -> None:
        """After normalize_generated, total must equal sum of all activity costs."""
        prefs = TravelPreferences(
            destination="Tokyo",
            start_date=date(2025, 4, 1),
            end_date=date(2025, 4, 3),
            budget_usd=5000.0,
        )
        normalized = normalize_generated(generated, prefs)
        expected_total = round(
            sum(
                activity.estimated_cost_usd
                for day in normalized.days
                for activity in day.activities
            ),
            2,
        )
        assert normalized.total_estimated_cost_usd == expected_total
