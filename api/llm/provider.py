"""LLM provider abstraction and selection.

Defines the :class:`LLMProvider` interface that every concrete provider
implements, a process-wide token counter used by the debug endpoint, and the
:func:`get_provider` factory that selects a provider from settings. Concrete
OpenAI / LangChain providers are imported lazily so their (optional) third
party dependencies are only required when actually selected.
"""

from __future__ import annotations

import threading
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from api.config import Settings


class LLMProvider(ABC):
    """Abstract interface for itinerary-generating LLM providers."""

    #: Stable provider identifier persisted on each itinerary record.
    name: str

    @abstractmethod
    async def complete(self, system: str, user: str, max_tokens: int) -> str:
        """Return the model's raw completion as a JSON string.

        Args:
            system: The system prompt constraining output to JSON.
            user: The natural-language planning brief.
            max_tokens: Hard cap on generated tokens (cost control).
        """
        raise NotImplementedError


class _TokenCounter:
    """Thread-safe process-wide cumulative token counter."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._total = 0

    def add(self, tokens: int) -> None:
        """Add ``tokens`` to the running total."""
        with self._lock:
            self._total += tokens

    @property
    def total(self) -> int:
        """Cumulative tokens used in this process lifetime."""
        with self._lock:
            return self._total


#: Module-level singleton; real providers report usage here for the debug view.
TOKEN_COUNTER = _TokenCounter()


def get_provider(settings: Settings) -> LLMProvider:
    """Select an :class:`LLMProvider` based on ``settings``.

    Falls back to the mock provider when ``LLM_PROVIDER=mock`` or when the
    selected real provider is missing *its own* API key — ``openai``/
    ``langchain`` need ``OPENAI_API_KEY`` and ``gemini`` needs
    ``GEMINI_API_KEY``. Otherwise returns the OpenAI provider for ``openai``,
    the LangChain wrapper for ``langchain``, and the Gemini provider for
    ``gemini``. Real-provider modules are imported lazily so the mock path
    never pulls in their dependencies.
    """
    provider = settings.llm_provider

    fall_back_to_mock = (
        provider == "mock"
        or (provider in ("openai", "langchain") and not settings.openai_api_key)
        or (provider == "gemini" and not settings.gemini_api_key)
    )
    if fall_back_to_mock:
        from api.llm.mock_provider import MockLLMProvider

        return MockLLMProvider()

    if provider == "openai":
        from api.llm.openai_provider import OpenAILLMProvider

        return OpenAILLMProvider(settings)

    if provider == "langchain":
        from api.llm.langchain_provider import LangChainLLMProvider

        return LangChainLLMProvider(settings)

    if provider == "gemini":
        from api.llm.gemini_provider import GeminiLLMProvider

        return GeminiLLMProvider(settings)

    # Unreachable given the Literal type on the setting, but explicit is safe.
    raise ValueError(f"Unknown LLM_PROVIDER: {provider!r}")
