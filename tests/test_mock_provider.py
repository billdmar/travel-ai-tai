"""Tests asserting the mock provider stays faithful to the frozen schema."""

from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import uuid4

from api.llm.mock_provider import MockLLMProvider, build_mock_itinerary
from api.models import GeneratedItinerary, ItineraryResponse, TravelPreferences


def test_build_mock_itinerary_validates() -> None:
    raw = build_mock_itinerary()
    generated = GeneratedItinerary.model_validate(raw)
    assert generated.days
    assert generated.currency == "USD"


async def test_mock_complete_output_validates() -> None:
    provider = MockLLMProvider()
    assert provider.name == "mock"
    raw = await provider.complete(system="s", user="u", max_tokens=100)
    generated = GeneratedItinerary.model_validate_json(raw)
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
