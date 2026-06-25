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
import logging
import re
from datetime import date, timedelta
from typing import Any

from api.llm.provider import LLMProvider, LLMResult


def _osm(place: str) -> str:
    return f"https://www.openstreetmap.org/search?query={place.replace(' ', '+')}"


#: Real city-center (lat, lng) anchors keyed by a normalized city substring.
#: Covers every city in ``_DESTINATION_CATALOG`` plus the destinations users
#: most commonly type, so the live mock demo drops map pins on the *actual*
#: city (the hash fallback below used to land Sydney near 55N and Cairo in the
#: Pacific). Lookup matches on a city substring (see ``_mock_base_coords``), so
#: "Paris, France" and "paris" both resolve. Keep keys lowercase + bare city.
_CITY_COORDS: dict[str, tuple[float, float]] = {
    # Discovery catalog cities.
    "chamonix": (45.9237, 6.8694),
    "kyoto": (35.0116, 135.7681),
    "lisbon": (38.7223, -9.1393),
    "queenstown": (-45.0312, 168.6626),
    "oaxaca": (17.0732, -96.7266),
    "reykjavik": (64.1466, -21.9426),
    "bali": (-8.4095, 115.1889),
    "vienna": (48.2082, 16.3738),
    # Commonly typed itinerary destinations.
    "paris": (48.8566, 2.3522),
    "tokyo": (35.6762, 139.6503),
    "rome": (41.9028, 12.4964),
    "new york": (40.7128, -74.0060),
    "nyc": (40.7128, -74.0060),
    "london": (51.5074, -0.1278),
    "barcelona": (41.3874, 2.1686),
    "sydney": (-33.8688, 151.2093),
    "cairo": (30.0444, 31.2357),
    "amsterdam": (52.3676, 4.9041),
    "berlin": (52.5200, 13.4050),
    "bangkok": (13.7563, 100.5018),
    "istanbul": (41.0082, 28.9784),
    "dubai": (25.2048, 55.2708),
    "san francisco": (37.7749, -122.4194),
    "los angeles": (34.0522, -118.2437),
    "singapore": (1.3521, 103.8198),
    "hong kong": (22.3193, 114.1694),
    "venice": (45.4408, 12.3155),
    "florence": (43.7696, 11.2558),
    "athens": (37.9838, 23.7275),
    "prague": (50.0755, 14.4378),
    "madrid": (40.4168, -3.7038),
    "marrakech": (31.6295, -7.9811),
}


def _mock_base_coords(destination: str) -> tuple[float, float]:
    """Derive a stable, plausible (lat, lng) anchor for a mock destination.

    Known cities (``_CITY_COORDS``) resolve to their *real* coordinates so the
    interactive map demo drops pins on the actual place — matched on a
    normalized city substring so "Paris, France" and "paris" both hit. Unknown
    destinations fall back to a deterministic hash of the name into a point
    within populated mid-latitudes/longitudes: enough for the map to show
    clustered pins that move when the destination changes, without claiming
    accuracy. The fallback stays inside valid lat/lng ranges so the Activity
    coord validator never drops it. A stable digest (not the salted built-in
    ``hash``) keeps coords reproducible across runs.
    """
    key = destination.strip().lower()
    for city, coords in _CITY_COORDS.items():
        if city in key:
            return coords
    h = int(hashlib.sha256(destination.encode("utf-8")).hexdigest(), 16)
    lat = (h % 12000) / 100.0 - 60.0  # -60.0 .. +59.99
    lng = (h // 12000 % 36000) / 100.0 - 180.0  # -180.0 .. +179.99
    return round(lat, 4), round(lng, 4)


#: Destination-aware travel tips keyed by a normalized city substring, matched
#: the same way as ``_CITY_COORDS``. Drawn from each catalog city's character
#: so the live mock shows tips that actually fit the place instead of one
#: generic trio. Unknown destinations fall back to ``_GENERIC_TIPS``.
_CITY_TIPS: dict[str, list[str]] = {
    "chamonix": [
        "Buy a multi-lift pass — the Aiguille du Midi and Montenvers railway "
        "sell out on clear summer mornings.",
        "Mountain weather turns fast; pack layers and check the refuge "
        "forecast before any high hike.",
    ],
    "kyoto": [
        "Visit Fushimi Inari and Arashiyama at sunrise to beat the crowds.",
        "Buy an IC transit card (ICOCA) — buses, not subways, reach most "
        "temples.",
        "Many temples close by 17:00, so plan the day around early starts.",
    ],
    "lisbon": [
        "Wear grippy shoes — the calçada cobblestones get slick downhill.",
        "Ride tram 28 early or late; midday it's packed with day-trippers.",
        "Day-trip to Sintra by train, and book the palace tickets online.",
    ],
    "queenstown": [
        "Book bungee, jet boat, and Milford Sound trips a day or two ahead "
        "in peak season.",
        "Summer alpine sun is intense — sunscreen and a windproof layer pay off.",
    ],
    "oaxaca": [
        "Come hungry for the markets — try mole, tlayudas, and a mezcal "
        "tasting flight.",
        "Carry small peso notes; many craft stalls and mezcalerías are "
        "cash-only.",
        "The mountain evenings cool off fast, so pack a light jacket.",
    ],
    "reykjavik": [
        "Rent a car for the Golden Circle and the south-coast waterfalls.",
        "Check aurora and road forecasts daily — conditions shift hourly.",
        "Pre-book the geothermal lagoons; walk-up slots sell out in winter.",
    ],
    "bali": [
        "Hire a scooter or driver — Ubud's rice terraces are spread out.",
        "Dress modestly and bring a sarong for temple visits.",
        "Stick to bottled or filtered water to avoid an upset stomach.",
    ],
    "vienna": [
        "Buy standing-room opera tickets at the Staatsoper for a few euros.",
        "Linger in a traditional coffeehouse — the seat comes with the order.",
        "A single transit pass covers trams, U-Bahn, and most museum districts.",
    ],
}

#: Generic fallback for unknown destinations — keeps the discovery flow useful
#: without claiming knowledge the mock doesn't have.
_GENERIC_TIPS: list[str] = [
    "Carry a contactless transit card for trains and buses.",
    "Many attractions are cheaper when booked online in advance.",
    "Learn a few local greetings — it goes a long way.",
]


def _mock_tips(destination: str) -> list[str]:
    """Return destination-aware tips, falling back to the generic trio.

    Matched on a normalized city substring (like ``_mock_base_coords``) so
    "Kyoto, Japan" and "kyoto" both resolve to Kyoto's tips.
    """
    key = destination.strip().lower()
    for city, tips in _CITY_TIPS.items():
        if city in key:
            return tips
    return _GENERIC_TIPS


# Per-slot rotating activity names, indexed by day, so multi-day trips vary
# without repeating and read naturally once the destination is appended
# downstream. Kept destination-agnostic (e.g. "Historic Old Town") so the server
# can build clean searchable links instead of doubled "Rome, Italy ..., Rome"
# queries. 12 entries each means a trip up to ~12 days never repeats a slot.
_MORNING_SIGHTS = [
    "Historic Old Town",
    "Landmark Cathedral",
    "Iconic Viewpoint",
    "National Museum",
    "Waterfront Promenade",
    "Royal Palace Grounds",
    "Ancient City Walls",
    "Grand Central Square",
    "Hilltop Fortress",
    "Old Harbour District",
    "Cultural Heritage Site",
    "Historic Botanical Conservatory",
]
_AFTERNOON_WALKS = [
    "Riverside Park Stroll",
    "Artisan Shopping District",
    "Botanical Gardens",
    "Scenic Hilltop Walk",
    "Historic Market Quarter",
    "Lakeside Promenade",
    "Old Quarter Backstreets",
    "Seaside Boardwalk",
    "Galleries & Design District",
    "Lantern-lit Night Market",
    "Sculpture Park Loop",
    "Café & Bookshop Lane",
]

#: Multiplier applied to every activity's base cost, derived from the trip's
#: budget tier and travel style, so a luxury/high-budget trip is visibly
#: pricier than a budget/low one. Tiers are picked by per-day budget
#: (``budget_usd / num_days``) and nudged by ``travel_style``: a backpacker
#: trims spend, a luxury traveler doubles it. Kept as round factors so the
#: re-summed grand total stays tidy.
_BUDGET_TIER_MULTIPLIER: list[tuple[float, float]] = [
    # (per-day budget threshold, multiplier) — first matching row from the top.
    (500.0, 4.0),  # ultra-luxury day budget
    (300.0, 2.5),
    (150.0, 1.5),
    (75.0, 1.0),
    (0.0, 0.6),  # shoestring
]

#: Travel-style nudge applied on top of the budget tier. Keys mirror the
#: ``TravelPreferences.travel_style`` literal ("budget" | "midrange" |
#: "luxury"); unknown styles fall through to a neutral 1.0x.
_STYLE_MULTIPLIER: dict[str, float] = {
    "luxury": 1.5,
    "midrange": 1.0,
    "budget": 0.7,
}


def _cost_multiplier(
    budget_usd: float | None, num_days: int, travel_style: str | None
) -> float:
    """Derive a cost multiplier from the trip's budget tier and travel style.

    The per-day budget (``budget_usd / num_days``) selects a base tier; the
    ``travel_style`` then nudges it. Both inputs are optional (the mock stays
    robust to unparsed prompts), defaulting to the balanced 1.0x behaviour that
    reproduces the original ~40 USD/day trip.
    """
    multiplier = 1.0
    if budget_usd is not None and num_days > 0:
        per_day = budget_usd / num_days
        for threshold, factor in _BUDGET_TIER_MULTIPLIER:
            if per_day >= threshold:
                multiplier = factor
                break
    if travel_style is not None:
        multiplier *= _STYLE_MULTIPLIER.get(travel_style.strip().lower(), 1.0)
    return multiplier


def build_mock_itinerary(
    destination: str = "Tokyo, Japan",
    start: date | None = None,
    num_days: int = 3,
    budget_usd: float | None = None,
    travel_style: str | None = None,
) -> dict:
    """Build a mock ``GeneratedItinerary`` dict for ``num_days`` days.

    Place names are kept destination-agnostic (e.g. "Historic Old Town") so the
    server can append the real destination to build clean, searchable map and
    booking links — rather than baking the destination into the name, which
    produced awkward doubled queries like "Rome, Italy highlight 1A, Rome".

    ``budget_usd`` and ``travel_style`` scale every activity cost via
    ``_cost_multiplier`` so a luxury/high-budget trip is visibly pricier than a
    budget one; both default to the balanced 1.0x behaviour. The grand total is
    re-summed from the (scaled) activity costs so it always matches what the
    engine's ``normalize_generated`` recomputes.
    """
    start = start or date(2026, 7, 1)
    multiplier = _cost_multiplier(budget_usd, num_days, travel_style)
    day_themes = [
        "Landmarks & Old Town",
        "Museums & Local Culture",
        "Food, Markets & Local Life",
        "Nature & Day Trip",
        "Art, Shopping & Leisure",
    ]
    base_lat, base_lng = _mock_base_coords(destination)
    days = []
    total = 0.0
    for i in range(num_days):
        d = start + timedelta(days=i)
        sight = _MORNING_SIGHTS[i % len(_MORNING_SIGHTS)]
        walk = _AFTERNOON_WALKS[i % len(_AFTERNOON_WALKS)]
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
                "estimated_cost_usd": round(15.0 * multiplier, 2),
                "category": "attraction",
                "map_url": _osm(f"{sight} {destination}"),
                "lat": day_lat,
                "lng": day_lng,
            },
            {
                "time": "13:00",
                "place": "Local Market Food Hall",
                "description": "Lunch featuring regional specialties.",
                "estimated_cost_usd": round(25.0 * multiplier, 2),
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
        "tips": _mock_tips(destination),
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
        destination, num_days, budget_usd, travel_style = _parse_itinerary_request(user)
        return LLMResult(
            json.dumps(
                build_mock_itinerary(
                    destination=destination,
                    num_days=num_days,
                    budget_usd=budget_usd,
                    travel_style=travel_style,
                )
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

# The same prompt renders a comma-grouped dollar budget and a travel style on
# their own lines (see prompts/itinerary.py):
#   "... a total budget of $2,000 USD."
#   "Travel style: comfort."
_BUDGET_RE = re.compile(r"total budget of \$(?P<budget>[\d,]+) USD", re.IGNORECASE)
_STYLE_RE = re.compile(r"Travel style:\s*(?P<style>[^.\n]+)", re.IGNORECASE)


def _parse_itinerary_request(user: str) -> tuple[str, int, float | None, str | None]:
    """Extract ``(destination, num_days, budget_usd, travel_style)`` from the prompt.

    Best-effort against the fixed ``build_user_prompt`` format: the destination
    and day count fall back to the ``build_mock_itinerary`` defaults
    ("Tokyo, Japan", 3 days) if the core pattern doesn't match, and the budget
    and travel style are independently optional (``None`` when absent) so the
    mock stays robust to prompt changes. ``budget_usd``/``travel_style`` drive
    the cost multiplier in ``build_mock_itinerary``.
    """
    match = _ITINERARY_RE.search(user)
    if not match:
        logging.warning("mock provider: itinerary prompt did not match expected shape")
        return "Tokyo, Japan", 3, None, None
    destination = match.group("destination").strip()
    num_days = max(1, int(match.group("days")))

    budget_usd: float | None = None
    budget_match = _BUDGET_RE.search(user)
    if budget_match:
        budget_usd = float(budget_match.group("budget").replace(",", ""))

    travel_style: str | None = None
    style_match = _STYLE_RE.search(user)
    if style_match:
        travel_style = style_match.group("style").strip() or None

    return destination or "Tokyo, Japan", num_days, budget_usd, travel_style
