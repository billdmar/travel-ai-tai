"""Prompt construction for hobby-driven destination discovery.

Mirrors :mod:`api.llm.prompts.itinerary`: the system prompt embeds the
``DestinationRecommendation`` JSON schema verbatim and insists on JSON-only
output (the literal word "JSON" is required so OpenAI's
``response_format={"type": "json_object"}`` mode is satisfied — the API rejects
JSON-mode requests that never mention "JSON"). The user prompt turns the user's
hobbies and optional free text into a natural-language brief asking for 4-6
destinations that fit them.
"""

from __future__ import annotations

from api.models import HobbyRecommendationRequest

#: How many destinations discovery asks the model to return (also enforced at
#: the route layer, which validates the parsed output to this range).
MIN_DESTINATIONS = 4
MAX_DESTINATIONS = 6

# The exact shape the model must emit. Mirrors ``DestinationRecommendation`` —
# creative content only, wrapped in the ``recommendations`` envelope. Keep this
# in sync with the model.
_DESTINATIONS_SCHEMA = """{
  "recommendations": [
    {
      "name": "city or region name",
      "country": "country name",
      "why_it_fits": "1-2 sentences tying the place to the user's hobbies",
      "tags": ["3-5 short descriptive tags"],
      "image_query": "concise search phrase for a representative photo",
      "best_season": "the best time of year to visit"
    }
  ]
}"""


def build_system_prompt() -> str:
    """Build the system prompt that constrains the model to valid JSON.

    Embeds the target schema verbatim and forbids any non-JSON output.
    """
    return (
        "You are a well-travelled destination expert. You MUST respond with "
        "ONLY a valid JSON object matching this exact schema. No markdown, no "
        "prose, no code fences — only the JSON object.\n\n"
        f"JSON schema:\n{_DESTINATIONS_SCHEMA}\n\n"
        "Rules:\n"
        f"- Return between {MIN_DESTINATIONS} and {MAX_DESTINATIONS} "
        "destinations in `recommendations`.\n"
        "- Pick varied destinations across different countries and regions — "
        "do not cluster them all in one area.\n"
        "- Each `why_it_fits` must reference the user's stated hobbies "
        "concretely (name the activity or feature that matches).\n"
        "- `image_query` should be a short, photogenic search phrase (e.g. "
        '"Kyoto bamboo forest"), not a full sentence.\n'
        "- Return ONLY the JSON object."
    )


def build_user_prompt(request: HobbyRecommendationRequest) -> str:
    """Render the discovery request into a natural-language brief."""
    hobbies = ", ".join(request.hobbies) if request.hobbies else "no specific hobbies"
    free_text = request.free_text.strip() if request.free_text else "none"

    return (
        f"Recommend travel destinations for someone whose hobbies are: "
        f"{hobbies}.\n"
        f"Additional context from the traveler: {free_text}.\n"
        f"Suggest {MIN_DESTINATIONS}-{MAX_DESTINATIONS} destinations where "
        "these hobbies are especially rewarding, and explain why each one fits."
    )
