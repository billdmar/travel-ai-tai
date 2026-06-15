"""Tests for server-owned affiliate booking links.

Covers :func:`api.affiliate.booking_url`:

* an empty tag slot (the default placeholder) emits a clean PLAIN deep link
  with NO tracking params,
* a populated slot appends the partner's tracking parameter,
* each category routes to the right partner, and food/other return ``None``,

plus the end-to-end invariant that ``RecommendationEngine.generate`` injects a
``booking_url`` onto every activity.
"""

from __future__ import annotations

from datetime import date

from api.affiliate import booking_url
from api.cache import ItineraryCache
from api.config import Settings
from api.llm.mock_provider import MockLLMProvider
from api.models import TravelPreferences
from api.recommend import RecommendationEngine

_DEST = "Tokyo, Japan"


def _settings(**overrides) -> Settings:
    base = {
        "LLM_PROVIDER": "mock",
        "RATE_LIMIT_ENABLED": False,
        "DATABASE_URL": "sqlite+aiosqlite:///:memory:",
    }
    base.update(overrides)
    return Settings(**base)


def _prefs(**overrides) -> TravelPreferences:
    base = {
        "destination": _DEST,
        "start_date": date(2026, 7, 1),
        "end_date": date(2026, 7, 3),
        "budget_usd": 1500.0,
        "interests": ["food", "temples"],
    }
    base.update(overrides)
    return TravelPreferences(**base)


# ── empty tag → clean plain link, no tracking params ─────────────────────────


def test_empty_viator_tag_emits_plain_link() -> None:
    url = booking_url("attraction", "Senso-ji Temple", _DEST, _settings())
    assert url is not None
    assert url.startswith("https://www.viator.com/searchResults/all?text=")
    # No fake tracking params when the slot is empty.
    assert "pid=" not in url


def test_empty_booking_tag_emits_plain_link() -> None:
    url = booking_url("accommodation", "Park Hotel", _DEST, _settings())
    assert url is not None
    assert url.startswith("https://www.booking.com/searchresults.html?ss=")
    assert "aid=" not in url


def test_empty_flights_tag_emits_plain_link() -> None:
    url = booking_url("transport", "Narita Airport", _DEST, _settings())
    assert url is not None
    assert url.startswith("https://www.kayak.com/flights?search=")
    assert "affiliate=" not in url


# ── populated tag → tagged link ──────────────────────────────────────────────


def test_populated_viator_tag_appends_pid() -> None:
    url = booking_url(
        "leisure", "Tea Ceremony", _DEST, _settings(AFFILIATE_TAG_VIATOR="P123")
    )
    assert url is not None and "pid=P123" in url


def test_populated_booking_tag_appends_aid() -> None:
    url = booking_url(
        "accommodation", "Park Hotel", _DEST, _settings(AFFILIATE_TAG_BOOKING="A99")
    )
    assert url is not None and "aid=A99" in url


def test_populated_flights_tag_appends_affiliate() -> None:
    url = booking_url(
        "transport", "Narita Airport", _DEST, _settings(AFFILIATE_TAG_FLIGHTS="F7")
    )
    assert url is not None and "affiliate=F7" in url


# ── category routing & query encoding ────────────────────────────────────────


def test_food_and_other_have_no_booking_partner() -> None:
    assert booking_url("food", "Sushi Bar", _DEST, _settings()) is None
    assert booking_url("other", "Misc", _DEST, _settings()) is None


def test_query_is_url_encoded_with_destination() -> None:
    url = booking_url("attraction", "Tokyo Tower", "Tokyo, Japan", _settings())
    assert url is not None
    # spaces/commas encoded; destination appended for the search query.
    assert " " not in url
    assert "Tokyo+Tower" in url


# ── end-to-end: generate() injects booking_url everywhere ────────────────────


async def test_generate_injects_booking_url(test_settings, sessionmaker) -> None:
    engine = RecommendationEngine(
        settings=test_settings,
        provider=MockLLMProvider(),
        cache=ItineraryCache(test_settings),
    )
    async with sessionmaker() as session:
        response = await engine.generate(_prefs(), session)

    activities = [a for day in response.days for a in day.activities]
    assert activities  # non-empty
    for activity in activities:
        # Every activity carries the server-owned booking_url attribute; it is a
        # working partner link for bookable categories and None otherwise.
        url = activity.booking_url
        if activity.category in ("food", "other"):
            assert url is None
        else:
            assert url is not None and url.startswith("https://")
