"""Share-token endpoint and persistence tests.

Covers the frozen share contract:

* ``POST /itineraries/{id}/share`` returns ``{"token": ...}``,
* the token is idempotent (same itinerary → same token),
* ``GET /shared/{token}`` returns the read-only itinerary,
* 404 for an unknown token and for sharing a missing/soft-deleted itinerary,
* the shared view is read-only (no save/delete routes under /shared),
* a minted token survives a simulated process restart (file-backed SQLite).
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from api.cache import ItineraryCache
from api.config import Settings
from api.db import ItineraryRecord, create_all
from api.llm.mock_provider import MockLLMProvider
from api.models import TravelPreferences
from api.recommend import RecommendationEngine
from api.share import lookup_share_token, mint_share_token

_MISSING_ID = "00000000-0000-0000-0000-000000000000"
_UNKNOWN_TOKEN = "this-token-does-not-exist"


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


def _prefs() -> TravelPreferences:
    return TravelPreferences(
        destination="Tokyo, Japan",
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 3),
        budget_usd=1500.0,
    )


async def test_share_then_fetch_shared(client) -> None:
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    iid = created["id"]

    share = await client.post(f"/api/v1/itineraries/{iid}/share")
    assert share.status_code == 200
    token = share.json()["token"]
    assert isinstance(token, str) and token

    fetched = await client.get(f"/api/v1/shared/{token}")
    assert fetched.status_code == 200
    body = fetched.json()
    assert body["id"] == iid
    assert body["preferences"]["destination"] == "Tokyo, Japan"
    # Read-only view exposes the same content as the owner's GET.
    owner = (await client.get(f"/api/v1/itineraries/{iid}")).json()
    assert body["days"] == owner["days"]


async def test_share_is_idempotent(client) -> None:
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    iid = created["id"]
    first = (await client.post(f"/api/v1/itineraries/{iid}/share")).json()["token"]
    second = (await client.post(f"/api/v1/itineraries/{iid}/share")).json()["token"]
    assert first == second


async def test_share_missing_itinerary_404(client) -> None:
    resp = await client.post(f"/api/v1/itineraries/{_MISSING_ID}/share")
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"] == "itinerary_not_found"


async def test_share_after_soft_delete_404(client) -> None:
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    iid = created["id"]
    assert (await client.delete(f"/api/v1/itineraries/{iid}")).status_code == 204
    resp = await client.post(f"/api/v1/itineraries/{iid}/share")
    assert resp.status_code == 404


async def test_delete_itinerary_invalidates_share_token(client) -> None:
    """Deleting an itinerary must stop its share link resolving (was 200)."""
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    iid = created["id"]
    token = (await client.post(f"/api/v1/itineraries/{iid}/share")).json()["token"]
    assert (await client.get(f"/api/v1/shared/{token}")).status_code == 200

    assert (await client.delete(f"/api/v1/itineraries/{iid}")).status_code == 204

    gone = await client.get(f"/api/v1/shared/{token}")
    assert gone.status_code == 404
    assert gone.json()["detail"]["error"] == "share_token_not_found"


async def test_shared_unknown_token_404(client) -> None:
    resp = await client.get(f"/api/v1/shared/{_UNKNOWN_TOKEN}")
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"] == "share_token_not_found"


async def test_shared_view_is_read_only(client) -> None:
    """No save/delete routes are exposed under the public /shared/{token} path."""
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    iid = created["id"]
    token = (await client.post(f"/api/v1/itineraries/{iid}/share")).json()["token"]
    # The share path only supports GET; mutating verbs are not routed there.
    assert (await client.delete(f"/api/v1/shared/{token}")).status_code == 405
    assert (await client.post(f"/api/v1/shared/{token}")).status_code == 405


async def test_lookup_share_token_soft_deleted_parent_returns_none(tmp_path) -> None:
    """Direct unit test: a soft-deleted parent yields None at the query layer."""
    url = f"sqlite+aiosqlite:///{tmp_path / 'lookup.db'}"
    settings = Settings(LLM_PROVIDER="mock", OPENAI_API_KEY=None, DATABASE_URL=url)
    engine = create_async_engine(url, future=True)
    await create_all(engine)
    sm = async_sessionmaker(engine, expire_on_commit=False)
    rec_engine = RecommendationEngine(
        settings=settings, provider=MockLLMProvider(), cache=ItineraryCache(settings)
    )

    async with sm() as session:
        created = await rec_engine.generate(_prefs(), session)
        token = await mint_share_token(session, str(created.id))
        assert token is not None
        # Sanity: resolves while live.
        assert await lookup_share_token(session, token) is not None

        # Soft-delete the parent directly (no token cleanup) and re-resolve.
        record = await session.get(ItineraryRecord, str(created.id))
        record.deleted_at = datetime.now(timezone.utc)
        await session.commit()
        assert await lookup_share_token(session, token) is None

    await engine.dispose()


async def test_share_token_survives_restart(tmp_path) -> None:
    db_file = tmp_path / "share_restart.db"
    url = f"sqlite+aiosqlite:///{db_file}"
    settings = Settings(LLM_PROVIDER="mock", OPENAI_API_KEY=None, DATABASE_URL=url)

    # ── First "process": generate, mint a token, dispose. ──
    engine = create_async_engine(url, future=True)
    await create_all(engine)
    sm = async_sessionmaker(engine, expire_on_commit=False)
    rec_engine = RecommendationEngine(
        settings=settings, provider=MockLLMProvider(), cache=ItineraryCache(settings)
    )
    async with sm() as session:
        created = await rec_engine.generate(_prefs(), session)
        token = await mint_share_token(session, str(created.id))
    assert token is not None
    await engine.dispose()

    # ── Second "process": reopen the same file, resolve the token. ──
    engine2 = create_async_engine(url, future=True)
    sm2 = async_sessionmaker(engine2, expire_on_commit=False)
    async with sm2() as session:
        resolved = await lookup_share_token(session, token)
    await engine2.dispose()

    assert resolved is not None
    assert str(resolved.id) == str(created.id)
    assert resolved.preferences.destination == "Tokyo, Japan"
