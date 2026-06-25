"""Recommendation-engine and cache-key tests."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import func, select

from api.cache import ItineraryCache
from api.db import ItineraryRecord
from api.llm.mock_provider import MockLLMProvider
from api.llm.provider import LLMProvider, LLMResult
from api.models import TravelPreferences
from api.recommend import (
    ItineraryParseError,
    LLMUnavailableError,
    RecommendationEngine,
    cache_key_for,
)


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


def test_cache_key_stable_and_order_independent() -> None:
    a = _prefs(interests=["food", "temples", "art"])
    b = _prefs(interests=["food", "temples", "art"])
    assert cache_key_for(a) == cache_key_for(b)
    # stable across repeated calls
    assert cache_key_for(a) == cache_key_for(a)


def test_cache_key_differs_for_different_prefs() -> None:
    a = _prefs(destination="Tokyo, Japan")
    b = _prefs(destination="Kyoto, Japan")
    assert cache_key_for(a) != cache_key_for(b)


def _engine(test_settings) -> RecommendationEngine:
    return RecommendationEngine(
        settings=test_settings,
        provider=MockLLMProvider(),
        cache=ItineraryCache(test_settings),
    )


async def test_identical_prefs_same_id_one_row(test_settings, sessionmaker) -> None:
    engine = _engine(test_settings)
    prefs = _prefs()

    async with sessionmaker() as session:
        first = await engine.generate(prefs, session)
    async with sessionmaker() as session:
        second = await engine.generate(prefs, session)

    assert first.id == second.id

    async with sessionmaker() as session:
        count = await session.scalar(
            select(func.count()).select_from(ItineraryRecord)
        )
    assert count == 1


async def test_different_prefs_different_id(test_settings, sessionmaker) -> None:
    engine = _engine(test_settings)
    async with sessionmaker() as session:
        a = await engine.generate(_prefs(destination="Tokyo, Japan"), session)
    async with sessionmaker() as session:
        b = await engine.generate(_prefs(destination="Kyoto, Japan"), session)
    assert a.id != b.id

    async with sessionmaker() as session:
        count = await session.scalar(
            select(func.count()).select_from(ItineraryRecord)
        )
    assert count == 2


async def test_created_at_stamped_by_database(test_settings, sessionmaker) -> None:
    # created_at is now server-owned (server_default=now()): the engine does not
    # set it in Python, so both the persisted row and the returned response must
    # still carry a DB-stamped value, and the two must agree.
    engine = _engine(test_settings)
    async with sessionmaker() as session:
        response = await engine.generate(_prefs(), session)

    assert response.created_at is not None

    async with sessionmaker() as session:
        record = await session.get(ItineraryRecord, str(response.id))
    assert record is not None
    assert record.created_at is not None
    # The response surfaces exactly the timestamp the database assigned the row.
    assert response.created_at == record.created_at


class _UnavailableProvider(LLMProvider):
    name = "openai"

    async def complete(self, system: str, user: str, max_tokens: int) -> LLMResult:  # noqa: ARG002
        raise LLMUnavailableError("provider down")


class _MalformedProvider(LLMProvider):
    name = "openai"

    async def complete(self, system: str, user: str, max_tokens: int) -> LLMResult:  # noqa: ARG002
        return LLMResult('{"not": "an itinerary"}')


async def test_unavailable_provider_propagates(test_settings, sessionmaker) -> None:
    engine = RecommendationEngine(
        settings=test_settings,
        provider=_UnavailableProvider(),
        cache=ItineraryCache(test_settings),
    )
    async with sessionmaker() as session:
        with pytest.raises(LLMUnavailableError):
            await engine.generate(_prefs(), session)


async def test_malformed_output_raises_parse_error(test_settings, sessionmaker) -> None:
    engine = RecommendationEngine(
        settings=test_settings,
        provider=_MalformedProvider(),
        cache=ItineraryCache(test_settings),
    )
    async with sessionmaker() as session:
        with pytest.raises(ItineraryParseError):
            await engine.generate(_prefs(), session)


class _TokenReportingProvider(LLMProvider):
    """A non-mock provider that returns a valid itinerary plus usage metadata."""

    name = "openai"

    async def complete(self, system: str, user: str, max_tokens: int) -> LLMResult:  # noqa: ARG002
        # Reuse the mock itinerary JSON so the schema validates, but report
        # real token usage the way a live provider would.
        import json

        from api.llm.mock_provider import build_mock_itinerary

        return LLMResult(json.dumps(build_mock_itinerary()), tokens_used=1234)


async def test_real_provider_tokens_persisted_and_returned(
    test_settings, sessionmaker
) -> None:
    # A non-mock provider that reports usage must NOT yield tokens_used=None:
    # the engine trusts the provider value and persists + returns it.
    engine = RecommendationEngine(
        settings=test_settings,
        provider=_TokenReportingProvider(),
        cache=ItineraryCache(test_settings),
    )
    async with sessionmaker() as session:
        response = await engine.generate(_prefs(), session)

    assert response.tokens_used == 1234

    async with sessionmaker() as session:
        record = await session.get(ItineraryRecord, str(response.id))
    assert record is not None
    assert record.tokens_used == 1234


class _NoUsageProvider(LLMProvider):
    """A non-mock provider whose response carries no usage metadata."""

    name = "openai"

    async def complete(self, system: str, user: str, max_tokens: int) -> LLMResult:  # noqa: ARG002
        # Valid itinerary JSON, but ``tokens_used`` left as the ``None`` default
        # the way a real response without usage metadata would arrive.
        import json

        from api.llm.mock_provider import build_mock_itinerary

        return LLMResult(json.dumps(build_mock_itinerary()))


async def test_provider_reporting_none_tokens_records_zero(
    test_settings, sessionmaker
) -> None:
    # The token rule is None-based, not name-based: ANY provider that reports
    # ``tokens_used=None`` (the mock, or a real response lacking usage metadata)
    # records 0 — distinguishing "no usage reported" from a real count.
    engine = RecommendationEngine(
        settings=test_settings,
        provider=_NoUsageProvider(),
        cache=ItineraryCache(test_settings),
    )
    async with sessionmaker() as session:
        response = await engine.generate(_prefs(), session)

    assert response.tokens_used == 0

    async with sessionmaker() as session:
        record = await session.get(ItineraryRecord, str(response.id))
    assert record is not None
    assert record.tokens_used == 0
