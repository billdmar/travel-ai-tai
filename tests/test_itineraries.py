"""Itinerary REST endpoint integration tests (httpx + ASGITransport)."""

from __future__ import annotations

from api.cache import ItineraryCache
from api.llm.provider import LLMProvider
from api.models import ItineraryResponse
from api.recommend import LLMUnavailableError, RecommendationEngine


def _payload(**overrides) -> dict:
    base = {
        "destination": "Tokyo, Japan",
        "start_date": "2026-07-01",
        "end_date": "2026-07-03",
        "budget_usd": 1500.0,
        "interests": ["food", "temples"],
    }
    base.update(overrides)
    return base


async def test_post_valid_returns_201_and_schema(client) -> None:
    resp = await client.post("/api/v1/itineraries", json=_payload())
    assert resp.status_code == 201
    body = resp.json()
    # full ItineraryResponse round-trips through the model
    parsed = ItineraryResponse.model_validate(body)
    assert parsed.provider == "mock"
    assert parsed.days
    assert body["preferences"]["destination"] == "Tokyo, Japan"


async def test_post_end_before_start_returns_422(client) -> None:
    resp = await client.post(
        "/api/v1/itineraries",
        json=_payload(start_date="2026-07-10", end_date="2026-07-01"),
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["error"] == "validation_failed"
    # Generic, stable detail — no Pydantic internals leak to the client.
    assert body["detail"] == "One or more fields were invalid."
    serialized = resp.text
    for leaked in ("loc", "type", "ctx"):
        assert leaked not in serialized


async def test_validate_preferences_valid(client) -> None:
    resp = await client.post("/api/v1/preferences/validate", json=_payload())
    assert resp.status_code == 200
    assert resp.json() == {"valid": True}


async def test_validate_preferences_invalid_422(client) -> None:
    resp = await client.post(
        "/api/v1/preferences/validate",
        json=_payload(start_date="2026-07-10", end_date="2026-07-01"),
    )
    assert resp.status_code == 422
    assert resp.json()["error"] == "validation_failed"


async def test_get_by_id(client) -> None:
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    resp = await client.get(f"/api/v1/itineraries/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


async def test_get_missing_404(client) -> None:
    resp = await client.get(
        "/api/v1/itineraries/00000000-0000-0000-0000-000000000000"
    )
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"] == "itinerary_not_found"


async def test_list_envelope(client) -> None:
    # The list returns ONLY saved itineraries, so save both before asserting.
    a = (await client.post("/api/v1/itineraries", json=_payload())).json()
    b = (
        await client.post("/api/v1/itineraries", json=_payload(destination="Kyoto"))
    ).json()
    await client.post(f"/api/v1/itineraries/{a['id']}/save")
    await client.post(f"/api/v1/itineraries/{b['id']}/save")
    resp = await client.get("/api/v1/itineraries")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"page", "per_page", "total", "items"}
    assert body["total"] == 2
    assert len(body["items"]) == 2


async def test_delete_then_get_404_soft_delete(client) -> None:
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    iid = created["id"]
    # Save first so the row is in the list, making the post-delete exclusion meaningful.
    await client.post(f"/api/v1/itineraries/{iid}/save")
    assert (await client.get("/api/v1/itineraries")).json()["total"] == 1
    delete_resp = await client.delete(f"/api/v1/itineraries/{iid}")
    assert delete_resp.status_code == 204
    get_resp = await client.get(f"/api/v1/itineraries/{iid}")
    assert get_resp.status_code == 404
    # excluded from the list too
    list_body = (await client.get("/api/v1/itineraries")).json()
    assert list_body["total"] == 0


async def test_delete_missing_404(client) -> None:
    resp = await client.delete(
        "/api/v1/itineraries/00000000-0000-0000-0000-000000000000"
    )
    assert resp.status_code == 404


async def test_docs_and_openapi_resolve_with_static_mount(client) -> None:
    # Route precedence: /docs and /openapi.json must win over any SPA mount.
    openapi = await client.get("/openapi.json")
    assert openapi.status_code == 200
    assert openapi.json()["info"]["version"] == "1.0.0"
    docs = await client.get("/docs")
    assert docs.status_code == 200


# ── Error-mapping paths via injected fake providers ─────────────────────────


class _UnavailableProvider(LLMProvider):
    name = "openai"

    async def complete(self, system: str, user: str, max_tokens: int) -> str:  # noqa: ARG002
        raise LLMUnavailableError("down")


class _MalformedProvider(LLMProvider):
    name = "openai"

    async def complete(self, system: str, user: str, max_tokens: int) -> str:  # noqa: ARG002
        return '{"bogus": true}'


async def test_llm_unavailable_maps_to_503_with_retry_after(
    app, client, test_settings
) -> None:
    app.state.engine = RecommendationEngine(
        settings=test_settings,
        provider=_UnavailableProvider(),
        cache=ItineraryCache(test_settings),
    )
    resp = await client.post("/api/v1/itineraries", json=_payload())
    assert resp.status_code == 503
    assert resp.json()["detail"]["error"] == "llm_unavailable"
    assert resp.headers.get("Retry-After") == "60"


async def test_malformed_llm_maps_to_502(app, client, test_settings) -> None:
    app.state.engine = RecommendationEngine(
        settings=test_settings,
        provider=_MalformedProvider(),
        cache=ItineraryCache(test_settings),
    )
    resp = await client.post("/api/v1/itineraries", json=_payload())
    assert resp.status_code == 502
    assert resp.json()["detail"]["error"] == "itinerary_parse_failed"
