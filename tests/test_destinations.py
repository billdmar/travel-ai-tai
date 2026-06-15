"""Discovery endpoint tests (httpx + ASGITransport).

The discovery router is registered by ``main.py`` (Terminal 4 owns that), so
these tests build a minimal self-contained app that includes the router — the
discovery flow touches no DB, so no persistence fixtures are needed. The
provider is swapped via ``app.dependency_overrides`` on ``provider_dependency``,
mirroring how conftest overrides ``get_session``.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from api.config import Settings
from api.llm.mock_provider import MockLLMProvider, build_mock_destinations
from api.llm.provider import LLMProvider
from api.models import DestinationRecommendationResponse
from api.routes.destinations import provider_dependency
from api.routes.destinations import router as destinations_router


def _build_app(provider: LLMProvider | None = None) -> FastAPI:
    """Build a tiny app with just the discovery router and an optional provider.

    When ``provider`` is given it is injected via ``provider_dependency``;
    otherwise the real ``get_provider`` factory runs against mock settings.
    """
    app = FastAPI()
    app.state.settings = Settings(LLM_PROVIDER="mock", OPENAI_API_KEY=None)
    app.include_router(destinations_router)
    if provider is not None:
        app.dependency_overrides[provider_dependency] = lambda: provider
    return app


async def _client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ── Mock-provider behavior (unit) ────────────────────────────────────────────


def test_build_mock_destinations_returns_4_to_6() -> None:
    result = build_mock_destinations(["hiking", "photography"])
    parsed = DestinationRecommendationResponse.model_validate(result)
    assert 4 <= len(parsed.recommendations) <= 6


def test_build_mock_destinations_is_hobby_relevant() -> None:
    # A surfing+food traveler should surface coastal/food picks first.
    result = build_mock_destinations(["surfing", "food"])
    names = [r["name"] for r in result["recommendations"]]
    assert {"Lisbon", "Bali"} & set(names)


def test_build_mock_destinations_empty_hobbies_still_valid() -> None:
    result = build_mock_destinations([])
    parsed = DestinationRecommendationResponse.model_validate(result)
    assert 4 <= len(parsed.recommendations) <= 6


async def test_mock_complete_serves_discovery() -> None:
    from api.llm.prompts.destinations import build_system_prompt, build_user_prompt
    from api.models import HobbyRecommendationRequest

    provider = MockLLMProvider()
    raw = await provider.complete(
        system=build_system_prompt(),
        user=build_user_prompt(HobbyRecommendationRequest(hobbies=["hiking"])),
        max_tokens=2000,
    )
    parsed = DestinationRecommendationResponse.model_validate_json(raw)
    assert 4 <= len(parsed.recommendations) <= 6


# ── Endpoint integration ─────────────────────────────────────────────────────


async def test_recommend_returns_4_to_6_on_mock() -> None:
    app = _build_app()
    async for client in _client(app):
        resp = await client.post(
            "/api/v1/destinations/recommend",
            json={"hobbies": ["hiking", "food"], "free_text": "love the mountains"},
        )
        assert resp.status_code == 200
        body = resp.json()
        parsed = DestinationRecommendationResponse.model_validate(body)
        assert 4 <= len(parsed.recommendations) <= 6
        # every recommendation carries a genuine, non-empty rationale
        assert all(r.why_it_fits.strip() for r in parsed.recommendations)


async def test_recommend_empty_hobbies_still_succeeds() -> None:
    app = _build_app()
    async for client in _client(app):
        resp = await client.post(
            "/api/v1/destinations/recommend", json={"hobbies": []}
        )
        assert resp.status_code == 200
        assert 4 <= len(resp.json()["recommendations"]) <= 6


class _MalformedProvider(LLMProvider):
    name = "openai"

    async def complete(self, system: str, user: str, max_tokens: int) -> str:  # noqa: ARG002
        return '{"bogus": true}'


class _TooFewProvider(LLMProvider):
    name = "openai"

    async def complete(self, system: str, user: str, max_tokens: int) -> str:  # noqa: ARG002
        # Schema-valid JSON but only 2 destinations — must fail the 4-6 check.
        return (
            '{"recommendations": ['
            '{"name": "A", "country": "X", "why_it_fits": "w", '
            '"tags": ["t"], "image_query": "q", "best_season": "s"},'
            '{"name": "B", "country": "Y", "why_it_fits": "w", '
            '"tags": ["t"], "image_query": "q", "best_season": "s"}]}'
        )


async def test_recommend_malformed_json_maps_to_502() -> None:
    app = _build_app(provider=_MalformedProvider())
    async for client in _client(app):
        resp = await client.post(
            "/api/v1/destinations/recommend", json={"hobbies": ["food"]}
        )
        assert resp.status_code == 502
        assert resp.json()["detail"]["error"] == "destinations_parse_failed"


async def test_recommend_count_out_of_range_maps_to_502() -> None:
    app = _build_app(provider=_TooFewProvider())
    async for client in _client(app):
        resp = await client.post(
            "/api/v1/destinations/recommend", json={"hobbies": ["food"]}
        )
        assert resp.status_code == 502
        assert resp.json()["detail"]["error"] == "destinations_parse_failed"
