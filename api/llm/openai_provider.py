"""OpenAI-backed LLM provider.

Uses ``AsyncOpenAI`` with JSON-mode structured output and a tenacity retry
policy (3 attempts, exponential backoff) on transient rate-limit / timeout
errors. After the retries are exhausted it raises
:class:`~api.recommend.LLMUnavailableError`, which the API layer maps to a
``503`` with a ``Retry-After`` header. The ``openai`` package is imported
lazily so it is never required for the mock path.
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

logger = logging.getLogger("tai.llm.openai")


class OpenAILLMProvider(LLMProvider):
    """Calls the OpenAI Chat Completions API in JSON mode."""

    name = "openai"

    def __init__(self, settings: Settings) -> None:
        # Imported here so `openai` is only required when this provider is used.
        from openai import AsyncOpenAI

        self._settings = settings
        self._model = settings.openai_model
        self._client = AsyncOpenAI(api_key=settings.openai_api_key)

    async def complete(self, system: str, user: str, max_tokens: int) -> LLMResult:
        """Generate an itinerary completion, retrying transient failures."""
        import openai

        @retry(
            retry=retry_if_exception_type(
                (openai.RateLimitError, openai.APITimeoutError)
            ),
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=1, min=1, max=10),
            reraise=True,
        )
        async def _call() -> LLMResult:
            response = await self._client.chat.completions.create(
                model=self._model,
                response_format={"type": "json_object"},
                max_tokens=max_tokens,
                timeout=self._settings.llm_timeout_seconds,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            usage = response.usage
            tokens_used = None
            if usage is not None:
                tokens_used = usage.total_tokens
                TOKEN_COUNTER.add(tokens_used)
                logger.info("tokens_used=%d model=%s", tokens_used, self._model)
            return LLMResult(
                response.choices[0].message.content or "", tokens_used=tokens_used
            )

        try:
            return await _call()
        except (openai.RateLimitError, openai.APITimeoutError) as exc:
            logger.warning("OpenAI unavailable after retries: %s", exc)
            raise LLMUnavailableError(str(exc)) from exc
