"""Gemini provider quota-fallback tests.

When the Gemini call fails after retries (e.g. free-tier quota / 429), the
provider serves a deterministic mock completion instead of raising — so the live
demo always returns something. These tests stub the SDK at construction and
patch the per-call coroutine, so they need no real key and make no network call.
The fallback is toggleable via ``Settings.gemini_fallback_to_mock``.
"""

from __future__ import annotations

import sys
import types

import pytest

from api.config import Settings
from api.llm.prompts.destinations import build_system_prompt as discovery_system
from api.models import DestinationRecommendationResponse, GeneratedItinerary
from api.recommend import LLMUnavailableError


def _quota_error() -> Exception:
    """Return a 429-style error of the type the provider retries on.

    Mirrors the live failure (``google.api_core ResourceExhausted``); falls back
    to a plain ``Exception`` if the optional package is absent, which the
    provider's transient set also covers in that case.
    """
    try:
        from google.api_core.exceptions import ResourceExhausted

        return ResourceExhausted("429 quota exceeded")
    except ImportError:  # pragma: no cover - depends on optional dep internals
        return Exception("429 quota exceeded")


def _install_fake_genai(monkeypatch: pytest.MonkeyPatch) -> None:
    """Install a minimal fake ``google.generativeai`` so __init__ succeeds."""
    fake = types.ModuleType("google.generativeai")

    def configure(**_kw):  # noqa: ANN003
        return None

    class _Model:
        def __init__(self, *_a, **_kw):  # noqa: ANN002, ANN003
            pass

    fake.configure = configure  # type: ignore[attr-defined]
    fake.GenerativeModel = _Model  # type: ignore[attr-defined]
    # Ensure `import google.generativeai` resolves to the fake.
    google_pkg = sys.modules.get("google") or types.ModuleType("google")
    monkeypatch.setitem(sys.modules, "google", google_pkg)
    monkeypatch.setitem(sys.modules, "google.generativeai", fake)


def _provider(monkeypatch: pytest.MonkeyPatch, *, fallback: bool):
    _install_fake_genai(monkeypatch)
    from api.llm.gemini_provider import GeminiLLMProvider

    settings = Settings(
        LLM_PROVIDER="gemini",
        GEMINI_API_KEY="test-key",
        GEMINI_FALLBACK_TO_MOCK=fallback,
    )
    provider = GeminiLLMProvider(settings)

    # Force the per-call coroutine to raise a transient (quota-style) error so
    # tenacity exhausts and the except-branch runs. We raise the same exception
    # type the real SDK uses for a 429 (ResourceExhausted), matching the retried
    # set; if google.api_core is unavailable the set is broad Exception anyway.
    quota_error = _quota_error()

    async def _boom(*_a, **_kw):  # noqa: ANN002, ANN003
        raise quota_error

    fake_model = types.SimpleNamespace(generate_content_async=_boom)
    provider._model = fake_model  # type: ignore[attr-defined]
    return provider


async def test_itinerary_falls_back_to_mock_on_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider(monkeypatch, fallback=True)
    raw = await provider.complete(system="plan a trip", user="Tokyo", max_tokens=500)
    # Valid itinerary JSON from the mock, not a 503.
    generated = GeneratedItinerary.model_validate_json(raw)
    assert generated.days


async def test_discovery_falls_back_to_mock_on_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider(monkeypatch, fallback=True)
    raw = await provider.complete(
        system=discovery_system(), user="hobbies are: hiking", max_tokens=500
    )
    # The mock branches on the discovery system prompt → recommendations JSON.
    parsed = DestinationRecommendationResponse.model_validate_json(raw)
    assert 4 <= len(parsed.recommendations) <= 6


async def test_raises_when_fallback_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider(monkeypatch, fallback=False)
    with pytest.raises(LLMUnavailableError):
        await provider.complete(system="plan a trip", user="Tokyo", max_tokens=500)
