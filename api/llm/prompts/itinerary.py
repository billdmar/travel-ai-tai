"""Prompt construction for itinerary generation.

The system prompt embeds the ``GeneratedItinerary`` JSON schema verbatim and
insists on JSON-only output (the literal word "JSON" is required so that
OpenAI's ``response_format={"type": "json_object"}`` mode is satisfied — the
API rejects requests that ask for JSON mode without mentioning "JSON"). The
user prompt renders the structured preferences into a natural-language brief.
"""

from __future__ import annotations

from api.models import TravelPreferences

# The exact shape the model must emit. Mirrors ``GeneratedItinerary`` — the
# creative content only, with NO server-owned fields (id / created_at /
# preferences / provider / tokens_used). Keep this in sync with the model.
_GENERATED_ITINERARY_SCHEMA = """{
  "days": [
    {
      "day_number": 1,
      "date": "YYYY-MM-DD",
      "theme": "short theme for the day",
      "activities": [
        {
          "time": "HH:MM",
          "place": "name of the place",
          "description": "one or two sentences",
          "estimated_cost_usd": 0.0,
          "category": "food | attraction | transport | accommodation | leisure | other",
          "map_url": "https://www.openstreetmap.org/search?query=..."
        }
      ]
    }
  ],
  "total_estimated_cost_usd": 0.0,
  "currency": "USD",
  "summary": "2-3 sentence trip overview",
  "tips": ["3-5 practical travel tips"]
}"""


def build_system_prompt() -> str:
    """Build the system prompt that constrains the model to valid JSON.

    Embeds the target schema verbatim and forbids any non-JSON output.
    """
    return (
        "You are a professional travel planner. You MUST respond with ONLY a "
        "valid JSON object matching this exact schema. No markdown, no prose, "
        "no code fences — only the JSON object.\n\n"
        f"JSON schema:\n{_GENERATED_ITINERARY_SCHEMA}\n\n"
        "Rules:\n"
        "- Produce one entry in `days` for every day of the trip, with "
        "consecutive `day_number` starting at 1 and the correct calendar date.\n"
        "- Each day must contain at least three activities with realistic "
        "times and costs in USD.\n"
        "- `total_estimated_cost_usd` must equal the sum of all activity costs.\n"
        "- Use OpenStreetMap or Google Maps deep links for `map_url`.\n"
        "- Respect the traveler's budget, pace, interests, dietary and "
        "accessibility needs.\n"
        "- Return ONLY the JSON object."
    )


def build_user_prompt(prefs: TravelPreferences) -> str:
    """Render structured preferences into a natural-language planning brief."""
    interests = ", ".join(prefs.interests) if prefs.interests else "no specific interests"
    dietary = ", ".join(prefs.dietary_needs) if prefs.dietary_needs else "none"
    accessibility = (
        ", ".join(prefs.accessibility_needs) if prefs.accessibility_needs else "none"
    )
    notes = prefs.notes.strip() if prefs.notes else "none"

    return (
        f"Plan a {prefs.pace} {prefs.trip_length_days}-day trip to "
        f"{prefs.destination} from {prefs.start_date.isoformat()} to "
        f"{prefs.end_date.isoformat()} for {prefs.group_size} traveler(s) with "
        f"a total budget of ${prefs.budget_usd:,.0f} USD.\n"
        f"Interests: {interests}.\n"
        f"Travel style: {prefs.travel_style}.\n"
        f"Dietary needs: {dietary}.\n"
        f"Accessibility needs: {accessibility}.\n"
        f"Additional notes: {notes}."
    )
