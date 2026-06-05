"""Concurrency smoke test (PLAN adversarial-review #11 / honesty matrix).

Fires 50 concurrent POSTs against the mock provider and asserts every one
returns 201. This is the honest "designed for concurrency" evidence — NOT a
real load test.
"""

from __future__ import annotations

import asyncio


def _payload(i: int) -> dict:
    return {
        "destination": f"City {i}",
        "start_date": "2026-07-01",
        "end_date": "2026-07-03",
        "budget_usd": 1500.0,
        "interests": ["food"],
    }


async def test_fifty_concurrent_posts_all_201(client) -> None:
    async def _post(i: int) -> int:
        resp = await client.post("/api/v1/itineraries", json=_payload(i))
        return resp.status_code

    results = await asyncio.gather(*[_post(i) for i in range(50)])
    assert results == [201] * 50
