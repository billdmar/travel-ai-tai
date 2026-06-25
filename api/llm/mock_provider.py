"""Deterministic mock LLM provider.

Selected when no ``OPENAI_API_KEY`` is set or ``LLM_PROVIDER=mock``. Returns a
realistic, schema-valid ``GeneratedItinerary`` (itinerary flow) or
``DestinationRecommendationResponse`` (discovery flow) so the full pipeline
(engine → persistence → API → frontend) and the entire test suite run with zero
network calls and no API key. The mock's JSON is validated against the real
Pydantic schema in tests, so it cannot silently drift from the contract.

``complete`` serves both flows through the one ``LLMProvider`` interface: it
branches on a stable marker in the system prompt (the discovery schema names a
``recommendations`` array; the itinerary schema names ``days``).
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import date, timedelta
from typing import Any

from api.llm.provider import LLMProvider, LLMResult


def _osm(place: str) -> str:
    return f"https://www.openstreetmap.org/search?query={place.replace(' ', '+')}"


def _mock_base_coords(destination: str) -> tuple[float, float]:
    """Derive a stable, plausible (lat, lng) anchor for a mock destination.

    The mock's place names are destination-agnostic, so there are no real
    coordinates to emit. Instead we deterministically hash the destination into
    a point within populated mid-latitudes/longitudes — enough for the
    interactive map demo and tests to show clustered pins that move when the
    destination changes, without claiming geographic accuracy. A stable digest
    (not the salted built-in ``hash``) keeps coords reproducible across runs.
    """
    h = int(hashlib.sha256(destination.encode("utf-8")).hexdigest(), 16)
    lat = (h % 12000) / 100.0 - 60.0  # -60.0 .. +59.99
    lng = (h // 12000 % 36000) / 100.0 - 180.0  # -180.0 .. +179.99
    return round(lat, 4), round(lng, 4)


def build_mock_itinerary(
    destination: str = "Tokyo, Japan",
    start: date | None = None,
    num_days: int = 3,
) -> dict:
    """Build a mock ``GeneratedItinerary`` dict for ``num_days`` days.

    Place names are kept destination-agnostic (e.g. "Historic Old Town") so the
    server can append the real destination to build clean, searchable map and
    booking links — rather than baking the destination into the name, which
    produced awkward doubled queries like "Rome, Italy highlight 1A, Rome".
    """
    start = start or date(2026, 7, 1)
    day_themes = [
        "Landmarks & Old Town",
        "Museums & Local Culture",
        "Food, Markets & Local Life",
        "Nature & Day Trip",
        "Art, Shopping & Leisure",
    ]
    # Per-slot rotating names, indexed by day, so multi-day trips vary without
    # repeating and read naturally once the destination is appended downstream.
    morning_sights = [
        "Historic Old Town",
        "Landmark Cathedral",
        "Iconic Viewpoint",
        "National Museum",
        "Waterfront Promenade",
    ]
    afternoon_walks = [
        "Riverside Park Stroll",
        "Artisan Shopping District",
        "Botanical Gardens",
        "Scenic Hilltop Walk",
        "Historic Market Quarter",
    ]
    base_lat, base_lng = _mock_base_coords(destination)
    days = []
    total = 0.0
    for i in range(num_days):
        d = start + timedelta(days=i)
        sight = morning_sights[i % len(morning_sights)]
        walk = afternoon_walks[i % len(afternoon_walks)]
        # Spread the day's three pins ~1-2km around the destination anchor (and
        # nudge each day so multi-day trips don't stack markers) — purely so the
        # map demo shows distinct, clustered points.
        day_lat = round(base_lat + i * 0.01, 4)
        day_lng = round(base_lng + i * 0.01, 4)
        activities: list[dict[str, Any]] = [
            {
                "time": "09:00",
                "place": sight,
                "description": "Morning visit to a signature local attraction.",
                "estimated_cost_usd": 15.0,
                "category": "attraction",
                "map_url": _osm(f"{sight} {destination}"),
                "lat": day_lat,
                "lng": day_lng,
            },
            {
                "time": "13:00",
                "place": "Local Market Food Hall",
                "description": "Lunch featuring regional specialties.",
                "estimated_cost_usd": 25.0,
                "category": "food",
                "map_url": _osm(f"restaurant {destination}"),
                "lat": round(day_lat + 0.008, 4),
                "lng": round(day_lng - 0.006, 4),
            },
            {
                "time": "16:00",
                "place": walk,
                "description": "Afternoon stroll through a characterful district.",
                "estimated_cost_usd": 0.0,
                "category": "leisure",
                "map_url": _osm(f"{walk} {destination}"),
                "lat": round(day_lat - 0.005, 4),
                "lng": round(day_lng + 0.009, 4),
            },
        ]
        day_cost = sum(a["estimated_cost_usd"] for a in activities)
        total += day_cost
        days.append(
            {
                "day_number": i + 1,
                "date": d.isoformat(),
                "theme": day_themes[i % len(day_themes)],
                "activities": activities,
            }
        )

    return {
        "days": days,
        "total_estimated_cost_usd": round(total, 2),
        "currency": "USD",
        "summary": (
            f"A {num_days}-day trip to {destination} balancing iconic sights, "
            "authentic food, and relaxed neighborhood exploration."
        ),
        "tips": [
            "Carry a contactless transit card for trains and buses.",
            "Many attractions are cheaper when booked online in advance.",
            "Learn a few local greetings — it goes a long way.",
        ],
    }


# ── Discovery mock ──────────────────────────────────────────────────────────
# A small curated catalog. Each destination lists the hobbies it serves so the
# mock can return genuinely relevant picks (with a real ``why_it_fits``) for the
# user's stated hobbies — so the whole discovery flow looks great with no keys.
_DESTINATION_CATALOG: list[dict] = [
    {
        "name": "Chamonix",
        "country": "France",
        "why_it_fits": (
            "Sitting beneath Mont Blanc, Chamonix is one of the world's great "
            "alpine playgrounds for hiking, climbing, and skiing right from town."
        ),
        "tags": ["hiking", "skiing", "mountains", "alpine"],
        "image_query": "Chamonix Mont Blanc valley",
        "best_season": "June to September",
        "hobbies": {"hiking", "skiing", "climbing", "photography", "nature"},
    },
    {
        "name": "Kyoto",
        "country": "Japan",
        "why_it_fits": (
            "Hundreds of temples, traditional tea houses, and kaiseki dining "
            "make Kyoto unmatched for culture, food, and photography."
        ),
        "tags": ["temples", "food", "culture", "photography"],
        "image_query": "Kyoto bamboo forest Arashiyama",
        "best_season": "March to April and October to November",
        "hobbies": {"food", "photography", "history", "culture", "art"},
    },
    {
        "name": "Lisbon",
        "country": "Portugal",
        "why_it_fits": (
            "A sun-soaked coastal capital with a buzzing food scene, fado music, "
            "and easy surf day-trips along the Atlantic coast."
        ),
        "tags": ["food", "surfing", "music", "coastal"],
        "image_query": "Lisbon tram yellow Alfama",
        "best_season": "April to June and September to October",
        "hobbies": {"food", "surfing", "music", "nightlife", "photography"},
    },
    {
        "name": "Queenstown",
        "country": "New Zealand",
        "why_it_fits": (
            "The self-styled adventure capital pairs bungee jumping, jet boating, "
            "and world-class trails with cellar-door wine tasting."
        ),
        "tags": ["adventure", "hiking", "wine", "lakes"],
        "image_query": "Queenstown lake Wakatipu mountains",
        "best_season": "December to February",
        "hobbies": {"hiking", "adventure", "wine", "skiing", "nature"},
    },
    {
        "name": "Oaxaca",
        "country": "Mexico",
        "why_it_fits": (
            "A UNESCO food capital famous for mole and mezcal, with vibrant "
            "markets, craft workshops, and nearby archaeological ruins."
        ),
        "tags": ["food", "art", "history", "markets"],
        "image_query": "Oaxaca colorful street market",
        "best_season": "October to March",
        "hobbies": {"food", "art", "history", "culture", "photography"},
    },
    {
        "name": "Reykjavik",
        "country": "Iceland",
        "why_it_fits": (
            "A compact base for chasing the northern lights, soaking in geothermal "
            "lagoons, and photographing waterfalls and glaciers."
        ),
        "tags": ["nature", "photography", "wildlife", "geothermal"],
        "image_query": "Iceland northern lights waterfall",
        "best_season": "September to March for auroras",
        "hobbies": {"photography", "nature", "wildlife", "adventure", "hiking"},
    },
    {
        "name": "Bali",
        "country": "Indonesia",
        "why_it_fits": (
            "Reliable warm-water surf breaks, yoga retreats, and rice-terrace "
            "landscapes make Bali a favorite for surfers and wellness travelers."
        ),
        "tags": ["surfing", "wellness", "beaches", "nature"],
        "image_query": "Bali rice terraces Ubud",
        "best_season": "April to October",
        "hobbies": {"surfing", "wellness", "yoga", "diving", "photography"},
    },
    {
        "name": "Vienna",
        "country": "Austria",
        "why_it_fits": (
            "The city of Mozart and Klimt offers grand concert halls, world-class "
            "art museums, and classic coffeehouse culture."
        ),
        "tags": ["music", "art", "history", "architecture"],
        "image_query": "Vienna opera house Schonbrunn",
        "best_season": "April to May and September to October",
        "hobbies": {"music", "art", "history", "culture", "architecture"},
    },
]

#: Returned when no hobby matches anything in the catalog, so discovery always
#: yields a great-looking, varied set of picks.
_DEFAULT_DESTINATION_NAMES = ("Kyoto", "Lisbon", "Queenstown", "Reykjavik")

_MIN_DESTINATIONS = 4
_MAX_DESTINATIONS = 6


def build_mock_destinations(hobbies: list[str] | None = None) -> dict:
    """Build a mock ``DestinationRecommendationResponse`` dict.

    Destinations whose served hobbies overlap the user's stated ``hobbies`` are
    selected first (most-relevant first); the list is then topped up from the
    catalog to land within the 4-6 range. Each pick keeps its genuine
    ``why_it_fits`` so the discovery flow looks real on the mock provider.
    """
    wanted = {h.strip().lower() for h in (hobbies or []) if h.strip()}

    def relevance(dest: dict) -> int:
        return len(dest["hobbies"] & wanted)

    matched = [d for d in _DESTINATION_CATALOG if relevance(d) > 0]
    matched.sort(key=relevance, reverse=True)

    if not matched:
        matched = [
            d for d in _DESTINATION_CATALOG if d["name"] in _DEFAULT_DESTINATION_NAMES
        ]

    # Top up from the rest of the catalog to reach the minimum count.
    if len(matched) < _MIN_DESTINATIONS:
        for dest in _DESTINATION_CATALOG:
            if dest not in matched:
                matched.append(dest)
            if len(matched) >= _MIN_DESTINATIONS:
                break

    selected = matched[:_MAX_DESTINATIONS]
    recommendations = [
        {
            "name": d["name"],
            "country": d["country"],
            "why_it_fits": d["why_it_fits"],
            "tags": d["tags"],
            "image_query": d["image_query"],
            "best_season": d["best_season"],
        }
        for d in selected
    ]
    return {"recommendations": recommendations}


def _is_discovery_prompt(system: str) -> bool:
    """Detect the discovery flow from a stable marker in the system prompt.

    The discovery schema names a ``recommendations`` array; the itinerary schema
    names ``days``. Branching on the prompt keeps the single ``complete``
    interface serving both flows without changing the provider contract.
    """
    return '"recommendations"' in system


class MockLLMProvider(LLMProvider):
    """Mock provider implementing the ``LLMProvider`` interface."""

    name = "mock"

    async def complete(self, system: str, user: str, max_tokens: int) -> LLMResult:  # noqa: ARG002
        """Return a schema-valid completion for the requested flow.

        Serves discovery (``DestinationRecommendationResponse``) when the system
        prompt is the discovery prompt, otherwise an itinerary
        (``GeneratedItinerary``). The user's hobbies are parsed from the
        discovery user prompt so the picks adapt to the request. Signature
        matches the real provider for drop-in swapping; ``tokens_used`` stays
        ``None`` since no model is called.
        """
        if _is_discovery_prompt(system):
            return LLMResult(json.dumps(build_mock_destinations(_parse_hobbies(user))))
        destination, num_days = _parse_itinerary_request(user)
        return LLMResult(
            json.dumps(
                build_mock_itinerary(destination=destination, num_days=num_days)
            )
        )


def _parse_hobbies(user: str) -> list[str]:
    """Extract the hobby list from the discovery user prompt.

    The prompt embeds ``hobbies are: a, b, c.`` — best-effort parsing so the
    mock adapts; an empty list (no match) still yields a great default set.
    """
    marker = "hobbies are:"
    lowered = user.lower()
    idx = lowered.find(marker)
    if idx == -1:
        return []
    tail = user[idx + len(marker) :]
    # Stop at the first sentence boundary; hobbies are a single comma list.
    tail = tail.split(".")[0].split("\n")[0]
    return [h.strip() for h in tail.split(",") if h.strip()]


# Matches the itinerary user prompt built by ``build_user_prompt``:
#   "Plan a {pace} {N}-day trip to {destination} from {date} to ..."
_ITINERARY_RE = re.compile(
    r"(?P<days>\d+)-day trip to (?P<destination>.+?) from ", re.IGNORECASE
)


def _parse_itinerary_request(user: str) -> tuple[str, int]:
    """Extract ``(destination, num_days)`` from the itinerary user prompt.

    Best-effort: falls back to the ``build_mock_itinerary`` defaults
    ("Tokyo, Japan", 3 days) if the prompt doesn't match the expected shape, so
    the mock stays robust to prompt changes.
    """
    match = _ITINERARY_RE.search(user)
    if not match:
        return "Tokyo, Japan", 3
    destination = match.group("destination").strip()
    num_days = int(match.group("days"))
    # Mirror build_mock_itinerary's themed-day rotation cap (1-5 days of content).
    num_days = max(1, min(num_days, 5))
    return destination or "Tokyo, Japan", num_days
