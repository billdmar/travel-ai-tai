"""Anthropic Claude-backed LLM provider.

Uses ``AsyncAnthropic`` with a tenacity retry policy (3 attempts, exponential
backoff) on transient rate-limit / timeout errors. After the retries are
exhausted it raises :class:`~api.recommend.LLMUnavailableError`, which the API
layer maps to a ``503`` with a ``Retry-After`` header. The ``anthropic``
package is imported lazily so it is never required for the mock path.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from api.llm.provider import TOKEN_COUNTER, LLMProvider, LLMResult
from api.recommend import LLMUnavailableError

if TYPE_CHECKING:
    from api.config import Settings

logger = logging.getLogger("tai.llm.anthropic")


class AnthropicLLMProvider(LLMProvider):
    """Calls the Anthropic Messages API."""

    name = "anthropic"

    def __init__(self, settings: Settings) -> None:
        # Imported here so `anthropic` is only required when this provider is used.
        from anthropic import AsyncAnthropic

        self._settings = settings
        self._model = settings.anthropic_model
        self._client = AsyncAnthropic(
            api_key=settings.anthropic_api_key,
            timeout=settings.llm_timeout_seconds,
        )

    async def complete(self, system: str, user: str, max_tokens: int) -> LLMResult:
        """Generate an itinerary completion, retrying transient failures."""
        import anthropic

        @retry(
            retry=retry_if_exception_type(
                (anthropic.RateLimitError, anthropic.APITimeoutError)
            ),
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=2, min=2, max=20),
            reraise=True,
        )
        async def _call() -> LLMResult:
            response = await self._client.messages.create(
                model=self._model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            tokens_used = (
                response.usage.input_tokens + response.usage.output_tokens
            )
            TOKEN_COUNTER.add(tokens_used)
            logger.info("tokens_used=%d model=%s", tokens_used, self._model)
            return LLMResult(
                text=response.content[0].text, tokens_used=tokens_used
            )

        try:
            return await _call()
        except (anthropic.RateLimitError, anthropic.APITimeoutError) as exc:
            logger.warning("Anthropic unavailable after retries: %s", exc)
            raise LLMUnavailableError(str(exc)) from exc
