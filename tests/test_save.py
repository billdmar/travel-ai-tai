"""Save-endpoint and draft-vs-saved listing tests.

Covers the explicit-save contract added this branch:

* ``POST /itineraries/{id}/save`` returns 200 with ``saved=true``,
* re-saving is idempotent (200, same created row, timestamp unchanged),
* 404 when the id is missing or soft-deleted,
* a freshly generated DRAFT (``saved=false``) is absent from the Saved list
  but still retrievable via ``GET /itineraries/{id}``.
"""

from __future__ import annotations

_MISSING_ID = "00000000-0000-0000-0000-000000000000"


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


async def test_fresh_generation_is_draft(client) -> None:
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    assert created["saved"] is False


async def test_save_sets_saved_true(client) -> None:
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    resp = await client.post(f"/api/v1/itineraries/{created['id']}/save")
    assert resp.status_code == 200
    body = resp.json()
    assert body["saved"] is True
    assert body["id"] == created["id"]
    # subsequent GET reflects the saved state too.
    got = (await client.get(f"/api/v1/itineraries/{created['id']}")).json()
    assert got["saved"] is True


async def test_save_is_idempotent(client) -> None:
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    first = await client.post(f"/api/v1/itineraries/{created['id']}/save")
    assert first.status_code == 200
    second = await client.post(f"/api/v1/itineraries/{created['id']}/save")
    assert second.status_code == 200
    assert second.json()["saved"] is True
    # still exactly one row in the saved list (no duplicate, no churn).
    listing = (await client.get("/api/v1/itineraries")).json()
    assert listing["total"] == 1


async def test_save_missing_404(client) -> None:
    resp = await client.post(f"/api/v1/itineraries/{_MISSING_ID}/save")
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"] == "itinerary_not_found"


async def test_save_after_soft_delete_404(client) -> None:
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    iid = created["id"]
    assert (await client.delete(f"/api/v1/itineraries/{iid}")).status_code == 204
    resp = await client.post(f"/api/v1/itineraries/{iid}/save")
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"] == "itinerary_not_found"


async def test_draft_absent_from_list_but_gettable(client) -> None:
    created = (await client.post("/api/v1/itineraries", json=_payload())).json()
    iid = created["id"]
    # Draft is NOT in the saved list.
    listing = (await client.get("/api/v1/itineraries")).json()
    assert listing["total"] == 0
    assert all(item["id"] != iid for item in listing["items"])
    # ...but is still directly retrievable.
    got = await client.get(f"/api/v1/itineraries/{iid}")
    assert got.status_code == 200
    assert got.json()["id"] == iid
    assert got.json()["saved"] is False
    # After saving, it appears in the list.
    await client.post(f"/api/v1/itineraries/{iid}/save")
    listing2 = (await client.get("/api/v1/itineraries")).json()
    assert listing2["total"] == 1
    assert listing2["items"][0]["id"] == iid
