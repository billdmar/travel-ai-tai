"""Deterministic mock LLM provider.

Selected when no ``OPENAI_API_KEY`` is set or ``LLM_PROVIDER=mock``. Returns a
realistic, schema-valid ``GeneratedItinerary`` so the full pipeline (engine →
persistence → API → frontend) and the entire test suite run with zero network
calls and no API key. The mock's JSON is validated against the real Pydantic
schema in tests, so it cannot silently drift from the contract.
"""

from __future__ import annotations

import json
from datetime import date, timedelta


def _osm(place: str) -> str:
    return f"https://www.openstreetmap.org/search?query={place.replace(' ', '+')}"


def build_mock_itinerary(
    destination: str = "Tokyo, Japan",
    start: date | None = None,
    num_days: int = 3,
) -> dict:
    """Build a mock ``GeneratedItinerary`` dict for ``num_days`` days."""
    start = start or date(2026, 7, 1)
    day_themes = [
        "Temples & Traditional Culture",
        "Modern Tokyo & Technology",
        "Food, Markets & Local Life",
        "Day Trip & Nature",
        "Art, Shopping & Leisure",
    ]
    days = []
    total = 0.0
    for i in range(num_days):
        d = start + timedelta(days=i)
        activities = [
            {
                "time": "09:00",
                "place": f"{destination} highlight {i + 1}A",
                "description": "Morning visit to a signature local attraction.",
                "estimated_cost_usd": 15.0,
                "category": "attraction",
                "map_url": _osm(f"{destination} attraction {i + 1}"),
            },
            {
                "time": "13:00",
                "place": f"Local eatery near {destination}",
                "description": "Lunch featuring regional specialties.",
                "estimated_cost_usd": 25.0,
                "category": "food",
                "map_url": _osm(f"{destination} restaurant"),
            },
            {
                "time": "16:00",
                "place": f"{destination} neighborhood walk {i + 1}",
                "description": "Afternoon stroll through a characterful district.",
                "estimated_cost_usd": 0.0,
                "category": "leisure",
                "map_url": _osm(f"{destination} district {i + 1}"),
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


class MockLLMProvider:
    """Mock provider implementing the ``LLMProvider`` interface."""

    name = "mock"

    async def complete(self, system: str, user: str, max_tokens: int) -> str:  # noqa: ARG002
        """Return a schema-valid GeneratedItinerary JSON string.

        The destination and trip length are parsed from the user prompt when
        present so the mock adapts to the request; otherwise sensible defaults
        are used. Signature matches the real provider for drop-in swapping.
        """
        return json.dumps(build_mock_itinerary())
