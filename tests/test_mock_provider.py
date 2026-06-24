"""Tests asserting the mock provider stays faithful to the frozen schema."""

from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import uuid4

from api.llm.mock_provider import (
    MockLLMProvider,
    _parse_itinerary_request,
    build_mock_itinerary,
)
from api.llm.prompts.itinerary import build_user_prompt
from api.models import GeneratedItinerary, ItineraryResponse, TravelPreferences


def test_build_mock_itinerary_validates() -> None:
    raw = build_mock_itinerary()
    generated = GeneratedItinerary.model_validate(raw)
    assert generated.days
    assert generated.currency == "USD"


def test_mock_place_names_do_not_embed_destination() -> None:
    # Place names stay destination-agnostic so the server can append the real
    # destination cleanly (no doubled "Rome, Italy ... , Rome" map/booking links).
    raw = build_mock_itinerary(destination="Rome, Italy", num_days=2)
    places = [a["place"] for day in raw["days"] for a in day["activities"]]
    assert places  # non-empty
    assert all("Rome" not in p and "Italy" not in p for p in places)


def test_parse_itinerary_request_extracts_destination_and_length() -> None:
    prefs = TravelPreferences(
        destination="Rome, Italy",
        start_date=date(2026, 8, 1),
        end_date=date(2026, 8, 2),
        budget_usd=1200.0,
    )
    destination, num_days = _parse_itinerary_request(build_user_prompt(prefs))
    assert destination == "Rome, Italy"
    assert num_days == 2


def test_parse_itinerary_request_falls_back_when_unmatched() -> None:
    # Robust to non-matching prompts (e.g. the bare "u" used in other tests).
    assert _parse_itinerary_request("u") == ("Tokyo, Japan", 3)


async def test_mock_complete_honors_requested_destination() -> None:
    prefs = TravelPreferences(
        destination="Rome, Italy",
        start_date=date(2026, 8, 1),
        end_date=date(2026, 8, 3),
        budget_usd=1200.0,
    )
    result = await MockLLMProvider().complete(
        system="days schema", user=build_user_prompt(prefs), max_tokens=100
    )
    generated = GeneratedItinerary.model_validate_json(result.text)
    assert len(generated.days) == 3  # honors the 3-day request
    assert "Rome, Italy" in generated.summary


async def test_mock_complete_output_validates() -> None:
    provider = MockLLMProvider()
    assert provider.name == "mock"
    result = await provider.complete(system="s", user="u", max_tokens=100)
    # The mock makes no model call, so it reports no token usage.
    assert result.tokens_used is None
    generated = GeneratedItinerary.model_validate_json(result.text)
    # cost total equals the sum of activity costs in the mock
    summed = sum(
        a.estimated_cost_usd for day in generated.days for a in day.activities
    )
    assert generated.total_estimated_cost_usd == round(summed, 2)


def test_from_generated_assembles_full_response() -> None:
    generated = GeneratedItinerary.model_validate(build_mock_itinerary())
    prefs = TravelPreferences(
        destination="Tokyo, Japan",
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 3),
        budget_usd=1500.0,
    )
    response = ItineraryResponse.from_generated(
        id=uuid4(),
        created_at=datetime.now(timezone.utc),
        preferences=prefs,
        generated=generated,
        provider="mock",
        tokens_used=0,
    )
    assert response.provider == "mock"
    assert response.preferences.destination == "Tokyo, Japan"
    assert response.days == generated.days
    assert response.summary == generated.summary
    # round-trips through validation
    ItineraryResponse.model_validate(response.model_dump())
