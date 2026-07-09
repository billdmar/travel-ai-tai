"""Itinerary REST endpoint integration tests (httpx + ASGITransport)."""

from __future__ import annotations

from api.cache import ItineraryCache
from api.llm.provider import LLMProvider, LLMResult
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


async def test_regenerate_returns_new_itinerary_with_different_id(client) -> None:
    # Create a source trip, then regenerate it with adjusted preferences. The
    # adjusted prefs differ, so the engine produces a brand-new itinerary (new
    # id) rather than returning the cached source.
    source = (await client.post("/api/v1/itineraries", json=_payload())).json()
    resp = await client.post(
        f"/api/v1/itineraries/{source['id']}/regenerate",
        json=_payload(destination="Osaka, Japan", budget_usd=3000.0),
    )
    assert resp.status_code == 201
    body = resp.json()
    parsed = ItineraryResponse.model_validate(body)
    assert str(parsed.id) != source["id"]
    assert body["preferences"]["destination"] == "Osaka, Japan"
    # The source row is left intact (not mutated) and still resolves.
    assert (await client.get(f"/api/v1/itineraries/{source['id']}")).status_code == 200


async def test_regenerate_unknown_source_404(client) -> None:
    resp = await client.post(
        "/api/v1/itineraries/00000000-0000-0000-0000-000000000000/regenerate",
        json=_payload(),
    )
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"] == "itinerary_not_found"


def test_regenerate_wires_create_write_rate_limit(app) -> None:
    # The regenerate route must carry the SAME write rate-limit dependency that
    # protects POST /itineraries (rate limiting is disabled in tests, so assert
    # the wiring on the route rather than runtime headers). Both routes share the
    # one ``rate_limit`` dependency callable.
    from api.ratelimit import rate_limit

    def _deps(path: str, method: str) -> list:
        for route in app.routes:
            if getattr(route, "path", None) == path and method in getattr(
                route, "methods", set()
            ):
                return [d.call for d in route.dependant.dependencies]
        raise AssertionError(f"route not found: {method} {path}")

    create_deps = _deps("/api/v1/itineraries", "POST")
    regen_deps = _deps("/api/v1/itineraries/{itinerary_id}/regenerate", "POST")
    assert rate_limit in create_deps
    assert rate_limit in regen_deps


async def test_concurrent_save_keeps_original_timestamp(
    client, sessionmaker, monkeypatch
) -> None:
    # Lost-update regression guard. Reproduces the classic interleaving where
    # two saves of the same draft both observe ``saved_at IS NULL`` before
    # either persists, then both stamp it. With a monotonic clock minting a
    # strictly-later instant on every ``datetime.now()`` call, a lost update is
    # observable: the SECOND writer's later timestamp would clobber the first.
    #
    # Writer B carries a STALE view (it loaded the row as a draft, holding
    # ``saved_at = None`` in its identity map) and only commits AFTER writer A
    # has saved+committed — exactly the moment a read-modify-write does damage,
    # since B's in-Python ``record.saved_at is None`` check is satisfied by its
    # stale snapshot and it writes its own (later) timestamp on top of A's.
    #
    # The conditional UPDATE this guards re-evaluates ``saved_at IS NULL`` AT
    # THE DATABASE, so B's UPDATE matches no rows and A's earlier stamp survives.
    # Against the replaced read-modify-write, B clobbers A and this test fails.
    import itertools
    from datetime import datetime, timezone
    from uuid import UUID

    from api.db import ItineraryRecord
    from api.routes.itineraries import save_itinerary

    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    iid = created["id"]

    # Monotonic clock: each call yields a strictly later instant (microsecond++),
    # so the first and second stamps are distinguishable.
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    counter = itertools.count()
    monkeypatch.setattr(
        "api.routes.itineraries.datetime",
        type(
            "_Clock",
            (),
            {"now": staticmethod(lambda tz=None: base.replace(microsecond=next(counter)))},
        ),
    )

    # Writer B opens its session FIRST and reads the still-unsaved row, capturing
    # the stale ``saved_at = None`` snapshot in its identity map.
    session_b = sessionmaker()
    await session_b.__aenter__()
    stale = await session_b.get(ItineraryRecord, iid)
    assert stale is not None and stale.saved_at is None

    # Writer A saves and commits on its own session — first stamp lands.
    async with sessionmaker() as session_a:
        await save_itinerary(UUID(iid), session=session_a)

    async with sessionmaker() as probe:
        first_stamp = (await probe.get(ItineraryRecord, iid)).saved_at
    assert first_stamp is not None

    # Writer B now saves on its stale session. A read-modify-write would see its
    # cached None and overwrite A's stamp with a later one; the conditional
    # UPDATE no-ops because saved_at is already set at the DB.
    try:
        await save_itinerary(UUID(iid), session=session_b)
    finally:
        await session_b.__aexit__(None, None, None)

    async with sessionmaker() as probe:
        final_stamp = (await probe.get(ItineraryRecord, iid)).saved_at
    assert final_stamp == first_stamp, "second save must not clobber original timestamp"


# ── In-place day-activity editing (reorder + remove, no LLM) ────────────────


async def test_reorder_day_activities_renormalizes(client) -> None:
    # Create a trip, then reverse day 1's activity order. The response must come
    # back reordered, and the grand total must be unchanged (reordering moves no
    # money) and still equal the byte-for-byte sum the detail view derives.
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    iid = created["id"]
    day1 = created["days"][0]
    n = len(day1["activities"])
    assert n >= 2  # the mock itinerary has multiple activities per day
    original_places = [a["place"] for a in day1["activities"]]
    original_total = created["total_estimated_cost_usd"]

    reversed_order = list(reversed(range(n)))
    resp = await client.put(
        f"/api/v1/itineraries/{iid}/days/{day1['day_number']}/activities",
        json={"order": reversed_order},
    )
    assert resp.status_code == 200
    body = resp.json()
    parsed = ItineraryResponse.model_validate(body)
    new_places = [a["place"] for a in body["days"][0]["activities"]]
    assert new_places == list(reversed(original_places))
    # Pure reorder: grand total is invariant and still reconciles.
    assert parsed.total_estimated_cost_usd == original_total
    # The edit persisted in place (same id, fetchable, reordered).
    fetched = (await client.get(f"/api/v1/itineraries/{iid}")).json()
    assert [a["place"] for a in fetched["days"][0]["activities"]] == new_places


async def test_reorder_is_idempotent(client) -> None:
    # PUT idempotency: re-applying the SAME request to the resulting state is a
    # safe retry that converges. The order array is a permutation of the day's
    # CURRENT indices, so the retry-safe invariant is that re-sending the order
    # that produced the current arrangement (the identity once arranged) leaves
    # it unchanged. We verify by reordering once, then re-sending the identity
    # permutation — a retry of "this is the order" — and asserting no drift.
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    iid = created["id"]
    dn = created["days"][0]["day_number"]
    n = len(created["days"][0]["activities"])

    first = (
        await client.put(
            f"/api/v1/itineraries/{iid}/days/{dn}/activities",
            json={"order": list(reversed(range(n)))},
        )
    ).json()
    first_places = [a["place"] for a in first["days"][0]["activities"]]

    # Re-send the identity permutation (keep current order) twice; the stored
    # arrangement must not drift on either call.
    identity = list(range(n))
    for _ in range(2):
        again = (
            await client.put(
                f"/api/v1/itineraries/{iid}/days/{dn}/activities",
                json={"order": identity},
            )
        ).json()
        assert [a["place"] for a in again["days"][0]["activities"]] == first_places


async def test_remove_day_activity_recomputes_total(client) -> None:
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    iid = created["id"]
    day1 = created["days"][0]
    dn = day1["day_number"]
    n = len(day1["activities"])
    removed_cost = day1["activities"][0]["estimated_cost_usd"]
    original_total = created["total_estimated_cost_usd"]

    resp = await client.delete(
        f"/api/v1/itineraries/{iid}/days/{dn}/activities/0"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["days"][0]["activities"]) == n - 1
    # Grand total drops by exactly the removed activity's cost (re-normalized).
    assert body["total_estimated_cost_usd"] == round(original_total - removed_cost, 2)
    # Persisted in place.
    fetched = (await client.get(f"/api/v1/itineraries/{iid}")).json()
    assert len(fetched["days"][0]["activities"]) == n - 1


async def test_reorder_bad_permutation_404(client) -> None:
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    iid = created["id"]
    dn = created["days"][0]["day_number"]
    # Out-of-range index in the order array.
    resp = await client.put(
        f"/api/v1/itineraries/{iid}/days/{dn}/activities", json={"order": [0, 99]}
    )
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"] == "activity_index_out_of_range"


async def test_reorder_unknown_itinerary_404(client) -> None:
    resp = await client.put(
        "/api/v1/itineraries/00000000-0000-0000-0000-000000000000/days/1/activities",
        json={"order": [0]},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"] == "itinerary_not_found"


async def test_reorder_unknown_day_404(client) -> None:
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    resp = await client.put(
        f"/api/v1/itineraries/{created['id']}/days/999/activities",
        json={"order": [0]},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"] == "itinerary_not_found"


async def test_remove_out_of_range_index_404(client) -> None:
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    dn = created["days"][0]["day_number"]
    resp = await client.delete(
        f"/api/v1/itineraries/{created['id']}/days/{dn}/activities/999"
    )
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"] == "activity_index_out_of_range"


async def test_edit_endpoints_carry_write_rate_limit(app) -> None:
    # Both edit endpoints must carry the same write rate-limit dependency as
    # POST /itineraries (rate limiting is off in tests, so assert the wiring).
    from api.ratelimit import rate_limit

    def _deps(path: str, method: str) -> list:
        for route in app.routes:
            if getattr(route, "path", None) == path and method in getattr(
                route, "methods", set()
            ):
                return [d.call for d in route.dependant.dependencies]
        raise AssertionError(f"route not found: {method} {path}")

    put_deps = _deps(
        "/api/v1/itineraries/{itinerary_id}/days/{day_number}/activities", "PUT"
    )
    del_deps = _deps(
        "/api/v1/itineraries/{itinerary_id}/days/{day_number}/activities/{activity_index}",
        "DELETE",
    )
    assert rate_limit in put_deps
    assert rate_limit in del_deps


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


async def test_list_does_not_renormalize_each_row(client, monkeypatch) -> None:
    # Regression guard for the list N+1: the old path called record_to_response
    # for every row, which re-derives every activity's booking link via
    # api.affiliate.booking_url. The compact list never serializes those links,
    # so listing must not invoke that per-activity work at all — regardless of
    # how many saved rows (and activities) exist.
    import api.recommend as recommend

    a = (await client.post("/api/v1/itineraries", json=_payload())).json()
    b = (
        await client.post("/api/v1/itineraries", json=_payload(destination="Kyoto"))
    ).json()
    await client.post(f"/api/v1/itineraries/{a['id']}/save")
    await client.post(f"/api/v1/itineraries/{b['id']}/save")

    calls = {"n": 0}
    original = recommend.affiliate.booking_url

    def _counting_booking_url(*args, **kwargs):
        calls["n"] += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(recommend.affiliate, "booking_url", _counting_booking_url)

    resp = await client.get("/api/v1/itineraries")
    assert resp.status_code == 200
    # Bounded: zero per-activity normalization work for any number of rows.
    assert calls["n"] == 0


async def test_list_content_unchanged(client) -> None:
    # The compact projection must yield the same scalars the detail view does.
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    await client.post(f"/api/v1/itineraries/{created['id']}/save")
    detail = (await client.get(f"/api/v1/itineraries/{created['id']}")).json()

    item = (await client.get("/api/v1/itineraries")).json()["items"][0]
    assert item["id"] == created["id"]
    assert item["destination"] == detail["preferences"]["destination"]
    assert item["start_date"] == detail["preferences"]["start_date"]
    assert item["end_date"] == detail["preferences"]["end_date"]
    # Grand total matches the detail view byte-for-byte (same sum + rounding).
    assert item["total_estimated_cost_usd"] == detail["total_estimated_cost_usd"]


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
    assert openapi.json()["info"]["version"] == "1.1.0"
    docs = await client.get("/docs")
    assert docs.status_code == 200


# ── Error-mapping paths via injected fake providers ─────────────────────────


class _UnavailableProvider(LLMProvider):
    name = "openai"

    async def complete(self, system: str, user: str, max_tokens: int) -> LLMResult:  # noqa: ARG002
        raise LLMUnavailableError("down")


class _MalformedProvider(LLMProvider):
    name = "openai"

    async def complete(self, system: str, user: str, max_tokens: int) -> LLMResult:  # noqa: ARG002
        return LLMResult('{"bogus": true}')


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


class _FallbackProvider(LLMProvider):
    """A provider that degraded to the mock and reports a fallback reason."""

    name = "gemini"

    async def complete(self, system: str, user: str, max_tokens: int) -> LLMResult:  # noqa: ARG002
        import json

        from api.llm.mock_provider import build_mock_itinerary

        return LLMResult(
            json.dumps(build_mock_itinerary()),
            fallback_reason="gemini_unavailable: 429 quota exceeded",
        )


async def test_silent_fallback_surfaces_via_header(
    app, client, test_settings
) -> None:
    # A graceful provider degrade still returns 201 with an itinerary, but the
    # X-LLM-Fallback header makes the otherwise-silent degrade visible.
    app.state.engine = RecommendationEngine(
        settings=test_settings,
        provider=_FallbackProvider(),
        cache=ItineraryCache(test_settings),
    )
    resp = await client.post("/api/v1/itineraries", json=_payload())
    assert resp.status_code == 201
    assert resp.headers.get("X-LLM-Fallback") == "gemini_unavailable: 429 quota exceeded"
    # The itinerary is still returned; fallback_reason is not persisted, so it is
    # surfaced only on this fresh generation response.
    assert resp.json()["fallback_reason"] == "gemini_unavailable: 429 quota exceeded"


# ── ETag / conditional GET ────────────────────────────────────────────────────


async def test_get_itinerary_returns_etag(client) -> None:
    """GET /itineraries/{id} includes an ETag header on the response."""
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    resp = await client.get(f"/api/v1/itineraries/{created['id']}")
    assert resp.status_code == 200
    etag = resp.headers.get("etag")
    assert etag is not None
    assert etag.startswith('W/"') and etag.endswith('"')


async def test_conditional_get_returns_304(client) -> None:
    """GET with matching If-None-Match returns 304 and empty body."""
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    first = await client.get(f"/api/v1/itineraries/{created['id']}")
    assert first.status_code == 200
    etag = first.headers["etag"]

    second = await client.get(
        f"/api/v1/itineraries/{created['id']}",
        headers={"If-None-Match": etag},
    )
    assert second.status_code == 304
    assert second.headers.get("etag") == etag
    assert second.content == b""


async def test_conditional_get_mismatch_returns_200(client) -> None:
    """GET with a non-matching If-None-Match still returns 200 with body."""
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    resp = await client.get(
        f"/api/v1/itineraries/{created['id']}",
        headers={"If-None-Match": '"wrong"'},
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]
    assert resp.headers.get("etag") is not None
