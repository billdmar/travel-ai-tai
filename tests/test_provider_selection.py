"""Provider-selection logic tests for :func:`api.llm.provider.get_provider`.

These stay SDK-free: they only exercise the *selection* branches that do not
import a third-party SDK. In particular, ``gemini`` without a key falls back to
the mock provider (no ``google-genai`` import), and ``mock`` always
returns the mock provider.
"""

from __future__ import annotations

from api.config import Settings
from api.llm.mock_provider import MockLLMProvider
from api.llm.provider import get_provider


def test_mock_provider_selected() -> None:
    settings = Settings(LLM_PROVIDER="mock")
    provider = get_provider(settings)
    assert isinstance(provider, MockLLMProvider)
    assert provider.name == "mock"


def test_gemini_without_key_falls_back_to_mock() -> None:
    # gemini selected but no GEMINI_API_KEY → mock (never imports the SDK).
    settings = Settings(LLM_PROVIDER="gemini", GEMINI_API_KEY=None)
    provider = get_provider(settings)
    assert isinstance(provider, MockLLMProvider)
    assert provider.name == "mock"


def test_openai_without_key_falls_back_to_mock() -> None:
    settings = Settings(LLM_PROVIDER="openai", OPENAI_API_KEY=None)
    provider = get_provider(settings)
    assert isinstance(provider, MockLLMProvider)
    assert provider.name == "mock"
