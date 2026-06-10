"""Pricing-normalization and Google-Maps-link tests.

Covers the server-owned invariants enforced by
:func:`api.recommend.normalize_generated` and
:func:`api.llm.prompts.itinerary.maps_url`:

* the grand total is recomputed as the exact rounded sum of activity costs,
* per-activity costs are never mutated,
* every ``map_url`` becomes a canonical Google Maps search link,

both at the unit level (``normalize_generated`` / ``maps_url`` directly) and as
an end-to-end invariant after ``RecommendationEngine.generate``.
"""

from __future__ import annotations

from datetime import date
from urllib.parse import quote_plus

from api.cache import ItineraryCache
from api.llm.mock_provider import MockLLMProvider
from api.llm.prompts.itinerary import maps_url
from api.models import (
    Activity,
    GeneratedItinerary,
    ItineraryDay,
    TravelPreferences,
)
from api.recommend import RecommendationEngine, normalize_generated

_MAPS_PREFIX = "https://www.google.com/maps/search/?api=1&query="


def _prefs(**overrides) -> TravelPreferences:
    base = {
        "destination": "Tokyo, Japan",
        "start_date": date(2026, 7, 1),
        "end_date": date(2026, 7, 3),
        "budget_usd": 1500.0,
        "interests": ["food", "temples"],
    }
    base.update(overrides)
    return TravelPreferences(**base)


def _activity(place: str, cost: float) -> Activity:
    return Activity(
        time="09:00",
        place=place,
        description="A thing to do.",
        estimated_cost_usd=cost,
        category="attraction",
        map_url="https://example.com/wrong",
    )


def _generated(total: float, costs: list[float]) -> GeneratedItinerary:
    """Build a one-day GeneratedItinerary with a (possibly wrong) grand total."""
    activities = [_activity(f"Place {i}", c) for i, c in enumerate(costs)]
    day = ItineraryDay(
        day_number=1, date=date(2026, 7, 1), theme="Day", activities=activities
    )
    return GeneratedItinerary(
        days=[day],
        total_estimated_cost_usd=total,
        currency="USD",
        summary="A trip.",
        tips=["tip"],
    )


# ── maps_url helper ─────────────────────────────────────────────────────────


def test_maps_url_normal_case_appends_destination() -> None:
    url = maps_url("Tokyo Tower", "Tokyo, Japan")
    assert url == _MAPS_PREFIX + quote_plus("Tokyo Tower, Tokyo, Japan")
    assert url.startswith(_MAPS_PREFIX)


def test_maps_url_avoids_double_append_when_place_contains_destination() -> None:
    # place already contains the destination → no second append.
    url = maps_url("Cafe in Tokyo, Japan", "Tokyo, Japan")
    assert url == _MAPS_PREFIX + quote_plus("Cafe in Tokyo, Japan")
    # case-insensitive containment check.
    url2 = maps_url("Shop in tokyo, japan", "Tokyo, Japan")
    assert url2 == _MAPS_PREFIX + quote_plus("Shop in tokyo, japan")


def test_maps_url_encodes_spaces_and_commas() -> None:
    url = maps_url("Senso-ji Temple", "Tokyo, Japan")
    query = url.removeprefix(_MAPS_PREFIX)
    # spaces become '+', commas are percent-encoded by quote_plus.
    assert " " not in query
    assert "," not in query
    assert "+" in query  # spaces encoded
    assert "%2C" in query  # comma encoded


# ── normalize_generated: pricing ────────────────────────────────────────────


def test_normalize_corrects_wrong_grand_total() -> None:
    # Declared total (999) is deliberately wrong; true sum is 15 + 25 + 0 = 40.
    generated = _generated(total=999.0, costs=[15.0, 25.0, 0.0])
    fixed = normalize_generated(generated, _prefs())
    assert fixed.total_estimated_cost_usd == 40.0


def test_normalize_does_not_mutate_per_activity_costs() -> None:
    costs = [15.5, 24.25, 0.0]
    generated = _generated(total=0.0, costs=costs)
    fixed = normalize_generated(generated, _prefs())
    out_costs = [a.estimated_cost_usd for a in fixed.days[0].activities]
    assert out_costs == costs
    # original instance untouched (model_copy returns a new object).
    assert generated.total_estimated_cost_usd == 0.0


def test_normalize_total_equals_sum_of_activity_costs() -> None:
    generated = _generated(total=12.34, costs=[10.1, 20.2, 30.3])
    fixed = normalize_generated(generated, _prefs())
    expected = round(sum(a.estimated_cost_usd for a in fixed.days[0].activities), 2)
    assert fixed.total_estimated_cost_usd == expected == 60.6


def test_normalize_overwrites_every_map_url() -> None:
    generated = _generated(total=0.0, costs=[1.0, 2.0])
    fixed = normalize_generated(generated, _prefs())
    for activity in fixed.days[0].activities:
        assert activity.map_url.startswith(_MAPS_PREFIX)


# ── end-to-end invariants via generate() ────────────────────────────────────


def _engine(test_settings) -> RecommendationEngine:
    return RecommendationEngine(
        settings=test_settings,
        provider=MockLLMProvider(),
        cache=ItineraryCache(test_settings),
    )


async def test_generate_total_equals_activity_sum(test_settings, sessionmaker) -> None:
    engine = _engine(test_settings)
    async with sessionmaker() as session:
        response = await engine.generate(_prefs(), session)
    activity_sum = round(
        sum(
            a.estimated_cost_usd
            for day in response.days
            for a in day.activities
        ),
        2,
    )
    assert response.total_estimated_cost_usd == activity_sum


async def test_generate_every_map_url_is_canonical(test_settings, sessionmaker) -> None:
    engine = _engine(test_settings)
    async with sessionmaker() as session:
        response = await engine.generate(_prefs(), session)
    urls = [a.map_url for day in response.days for a in day.activities]
    assert urls  # non-empty
    assert all(u.startswith(_MAPS_PREFIX) for u in urls)
