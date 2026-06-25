"""Streaming endpoint tests for ``POST /api/v1/itineraries/stream``.

Verifies the SSE content type, that intermediate progress chunks stream before
the terminal event, that the LAST ``data:`` line is a full ``ItineraryResponse``
(the frozen frontend parse contract), and that the whole thing works on the mock
provider with zero API keys (via the conftest ``client`` fixture, which forces
``LLM_PROVIDER=mock``). Also covers the in-band error event when the engine's
provider is unavailable.
"""

from __future__ import annotations

import json

from api.models import ErrorResponse, ItineraryResponse
from api.recommend import ItineraryParseError, LLMUnavailableError


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


def _data_lines(text: str) -> list[str]:
    """Extract the payloads of every SSE ``data:`` line from a stream body."""
    return [
        line[len("data:") :].lstrip()
        for line in text.splitlines()
        if line.startswith("data:")
    ]


def _event_names(text: str) -> list[str]:
    """Extract the names of every SSE ``event:`` line from a stream body."""
    return [
        line[len("event:") :].strip()
        for line in text.splitlines()
        if line.startswith("event:")
    ]


async def test_stream_content_type_is_event_stream(client) -> None:
    resp = await client.post("/api/v1/itineraries/stream", json=_payload())
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")


async def test_stream_emits_progress_chunks_then_final_itinerary(client) -> None:
    resp = await client.post("/api/v1/itineraries/stream", json=_payload())
    assert resp.status_code == 200

    data_lines = _data_lines(resp.text)
    # Several progress chunks precede the terminal JSON line.
    assert len(data_lines) >= 2

    # Frozen contract: the LAST data line is the full ItineraryResponse JSON.
    final = ItineraryResponse.model_validate_json(data_lines[-1])
    assert final.provider == "mock"
    assert final.days
    assert final.preferences.destination == "Tokyo, Japan"

    # The earlier chunks are human-readable progress text, not the final JSON.
    assert data_lines[0] != data_lines[-1]
    assert "Tokyo, Japan" in data_lines[0]


async def test_stream_mock_fallback_works_with_no_keys(client) -> None:
    # The conftest client forces LLM_PROVIDER=mock with OPENAI_API_KEY=None, so
    # this exercises the keyless mock-stream path end to end.
    resp = await client.post("/api/v1/itineraries/stream", json=_payload(num_days=None))
    assert resp.status_code == 200
    final = ItineraryResponse.model_validate_json(_data_lines(resp.text)[-1])
    assert final.provider == "mock"


async def test_stream_invalid_preferences_returns_422(client) -> None:
    resp = await client.post(
        "/api/v1/itineraries/stream",
        json=_payload(start_date="2026-07-10", end_date="2026-07-01"),
    )
    assert resp.status_code == 422
    assert resp.json()["error"] == "validation_failed"


async def test_stream_llm_unavailable_emits_error_event(client, app) -> None:
    """When the engine raises LLMUnavailableError, the stream emits an in-band
    error event (status is already 200 once streaming has started)."""

    class _BoomEngine:
        async def generate(self, *_args, **_kwargs):
            raise LLMUnavailableError("provider down")

    app.state.engine = _BoomEngine()

    resp = await client.post("/api/v1/itineraries/stream", json=_payload())
    assert resp.status_code == 200
    data_lines = _data_lines(resp.text)
    assert data_lines, "expected at least one data event"

    # The failure is carried by a named ``event: error`` SSE event so the client
    # can distinguish it from the terminal itinerary and re-raise the real 503,
    # instead of mis-parsing the envelope as ItineraryResponse JSON.
    assert "error" in _event_names(resp.text)

    # The error event is schema-valid (validates against the shared envelope)
    # and its wire body is byte-identical to the historical {"error": "<code>"}
    # the frozen client expects (no extra null fields leak in).
    payload = json.loads(data_lines[-1])
    assert payload == {"error": "llm_unavailable"}
    assert ErrorResponse.model_validate(payload).error == "llm_unavailable"


async def test_stream_parse_failure_emits_schema_valid_error_event(client, app) -> None:
    """A mid-stream ItineraryParseError surfaces as a schema-valid error event."""

    class _BadParseEngine:
        async def generate(self, *_args, **_kwargs):
            raise ItineraryParseError("bad json")

    app.state.engine = _BadParseEngine()

    resp = await client.post("/api/v1/itineraries/stream", json=_payload())
    assert resp.status_code == 200
    assert "error" in _event_names(resp.text)
    payload = json.loads(_data_lines(resp.text)[-1])
    assert payload == {"error": "itinerary_parse_failed"}
    assert ErrorResponse.model_validate(payload).error == "itinerary_parse_failed"


async def test_stream_happy_path_emits_no_named_event(client) -> None:
    """The happy-path wire format is unchanged: progress + terminal itinerary
    travel as unnamed ``data:`` events, with no ``event:`` line in sight."""
    resp = await client.post("/api/v1/itineraries/stream", json=_payload())
    assert resp.status_code == 200
    assert _event_names(resp.text) == []
