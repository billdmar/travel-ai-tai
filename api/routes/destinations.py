"""Discovery REST endpoint under ``/api/v1``.

Turns a user's hobbies (plus optional free text) into 4-6 recommended
destinations. The handler is thin: it builds the discovery prompt, calls the
configured LLM provider, validates the output against the frozen
``DestinationRecommendationResponse`` schema, and enforces the 4-6 count.

Error mapping mirrors the itinerary route: provider-unavailable → ``503`` with
a ``Retry-After`` header, and JSON/schema/count parse failures → ``502``.

The provider is supplied via the ``provider_dependency`` so tests can override
it (the same pattern conftest uses for ``get_session``), while production
resolves it from ``app.state.settings`` through the existing ``get_provider``
factory.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import ValidationError

from api.llm.prompts.destinations import (
    MAX_DESTINATIONS,
    MIN_DESTINATIONS,
    build_system_prompt,
    build_user_prompt,
)
from api.llm.provider import LLMProvider, get_provider
from api.models import (
    DestinationRecommendationResponse,
    HobbyRecommendationRequest,
)
from api.recommend import LLMUnavailableError

logger = logging.getLogger("tai.routes.destinations")

router = APIRouter(prefix="/api/v1", tags=["destinations"])

_RAW_LOG_LIMIT = 500


def provider_dependency(request: Request) -> LLMProvider:
    """Resolve the configured LLM provider from app settings.

    Defined as a dependency so tests can override it via
    ``app.dependency_overrides`` (mirroring ``get_session``).
    """
    return get_provider(request.app.state.settings)


@router.post(
    "/destinations/recommend",
    response_model=DestinationRecommendationResponse,
)
async def recommend_destinations(
    payload: HobbyRecommendationRequest,
    provider: LLMProvider = Depends(provider_dependency),
) -> DestinationRecommendationResponse:
    """Recommend 4-6 destinations matching the user's hobbies."""
    try:
        result = await provider.complete(
            system=build_system_prompt(),
            user=build_user_prompt(payload),
            max_tokens=2000,
        )
        raw = result.text
    except LLMUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "llm_unavailable"},
            headers={"Retry-After": "60"},
        ) from exc

    try:
        result = DestinationRecommendationResponse.model_validate_json(raw)
    except ValidationError as exc:
        logger.warning("destinations_parse_failed raw=%r", raw[:_RAW_LOG_LIMIT])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"error": "destinations_parse_failed"},
        ) from exc

    count = len(result.recommendations)
    if not MIN_DESTINATIONS <= count <= MAX_DESTINATIONS:
        logger.warning(
            "destinations_count_out_of_range count=%d (want %d-%d)",
            count,
            MIN_DESTINATIONS,
            MAX_DESTINATIONS,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"error": "destinations_parse_failed"},
        )

    return result
