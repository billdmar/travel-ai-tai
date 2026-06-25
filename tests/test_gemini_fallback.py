"""Gemini provider quota-fallback tests.

When the Gemini call fails after retries (e.g. free-tier quota / 429), the
provider serves a deterministic mock completion instead of raising — so the live
demo always returns something. These tests stub the SDK at construction and
patch the per-call coroutine, so they need no real key and make no network call.
The fallback is toggleable via ``Settings.gemini_fallback_to_mock``.
"""

from __future__ import annotations

import types

import pytest

from api.config import Settings
from api.llm.prompts.destinations import build_system_prompt as discovery_system
from api.models import DestinationRecommendationResponse, GeneratedItinerary
from api.recommend import LLMUnavailableError


def _quota_error() -> Exception:
    """Return a 429-style error of the type the provider retries on.

    Mirrors the live failure: ``google-genai`` raises a ``ClientError`` with
    ``.code == 429`` for quota exhaustion, which the provider's transient set
    matches. The two-arg ``(code, response_json)`` constructor works fully
    offline (no live HTTP response needed).
    """
    from google.genai.errors import ClientError

    return ClientError(
        429,
        {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "quota exceeded"}},
    )


def _provider(monkeypatch: pytest.MonkeyPatch, *, fallback: bool):
    from api.llm.gemini_provider import GeminiLLMProvider

    settings = Settings(
        LLM_PROVIDER="gemini",
        GEMINI_API_KEY="test-key",
        GEMINI_FALLBACK_TO_MOCK=fallback,
    )
    provider = GeminiLLMProvider(settings)

    # Force the per-call coroutine to raise a transient (quota-style) error so
    # tenacity exhausts and the except-branch runs. We raise the same exception
    # the real SDK uses for a 429 (ClientError, code 429), which the provider's
    # transient predicate matches; the async call path is patched at
    # ``client.aio.models.generate_content`` so no real network call is made.
    quota_error = _quota_error()

    async def _boom(*_a, **_kw):  # noqa: ANN002, ANN003
        raise quota_error

    monkeypatch.setattr(
        provider._client.aio.models, "generate_content", _boom
    )
    return provider


async def test_itinerary_falls_back_to_mock_on_failure(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    provider = _provider(monkeypatch, fallback=True)
    with caplog.at_level("ERROR", logger="tai.llm.gemini"):
        result = await provider.complete(
            system="plan a trip", user="Tokyo", max_tokens=500
        )
    # Valid itinerary JSON from the mock, not a 503.
    generated = GeneratedItinerary.model_validate_json(result.text)
    assert generated.days
    # The silent degrade is made visible via fallback_reason.
    assert result.fallback_reason is not None
    assert "gemini_unavailable" in result.fallback_reason
    # ...and logged at ERROR (so it is picked up by Sentry, not buried at WARNING).
    assert any(
        rec.levelname == "ERROR" and "serving mock fallback" in rec.getMessage()
        for rec in caplog.records
    )


async def test_discovery_falls_back_to_mock_on_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider(monkeypatch, fallback=True)
    result = await provider.complete(
        system=discovery_system(), user="hobbies are: hiking", max_tokens=500
    )
    # The mock branches on the discovery system prompt → recommendations JSON.
    parsed = DestinationRecommendationResponse.model_validate_json(result.text)
    assert 4 <= len(parsed.recommendations) <= 6


async def test_raises_when_fallback_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider(monkeypatch, fallback=False)
    with pytest.raises(LLMUnavailableError):
        await provider.complete(system="plan a trip", user="Tokyo", max_tokens=500)


async def test_success_maps_text_and_tokens(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A successful call returns the SDK ``.text`` and maps
    ``usage_metadata.total_token_count`` onto ``LLMResult.tokens_used``."""
    from api.llm.gemini_provider import GeminiLLMProvider

    settings = Settings(LLM_PROVIDER="gemini", GEMINI_API_KEY="test-key")
    provider = GeminiLLMProvider(settings)

    # Shape the new SDK's GenerateContentResponse: `.text` plus a
    # `usage_metadata.total_token_count` (replaces the legacy SDK's identical
    # field name on the old response object).
    fake_resp = types.SimpleNamespace(
        text='{"ok": true}',
        usage_metadata=types.SimpleNamespace(total_token_count=123),
    )

    async def _ok(*_a, **_kw):  # noqa: ANN002, ANN003
        return fake_resp

    monkeypatch.setattr(provider._client.aio.models, "generate_content", _ok)

    result = await provider.complete(system="s", user="u", max_tokens=100)
    assert result.text == '{"ok": true}'
    assert result.tokens_used == 123
    assert result.fallback_reason is None


async def test_permanent_error_is_not_swallowed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A non-transient API error (e.g. 400) must surface, not degrade to mock —
    it signals a real bug, not a transient quota/availability blip."""
    from google.genai.errors import ClientError

    from api.llm.gemini_provider import GeminiLLMProvider

    settings = Settings(
        LLM_PROVIDER="gemini",
        GEMINI_API_KEY="test-key",
        GEMINI_FALLBACK_TO_MOCK=True,
    )
    provider = GeminiLLMProvider(settings)

    bad_request = ClientError(
        400, {"error": {"code": 400, "status": "INVALID_ARGUMENT", "message": "bad"}}
    )

    async def _boom(*_a, **_kw):  # noqa: ANN002, ANN003
        raise bad_request

    monkeypatch.setattr(provider._client.aio.models, "generate_content", _boom)

    # Despite fallback being enabled, a 400 is permanent and propagates.
    with pytest.raises(ClientError):
        await provider.complete(system="plan a trip", user="Tokyo", max_tokens=500)
