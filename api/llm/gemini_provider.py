"""Google Gemini-backed LLM provider (model ``gemini-2.0-flash``).

Uses the official ``google-generativeai`` SDK with JSON output and a tenacity
retry policy (3 attempts, exponential backoff) on transient rate-limit /
timeout / service errors. After the retries are exhausted it raises
:class:`~api.recommend.LLMUnavailableError`, which the API layer maps to a
``503`` with a ``Retry-After`` header. The ``google.generativeai`` package is
imported lazily so it is never required for the mock path.
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

from api.llm.provider import TOKEN_COUNTER, LLMProvider
from api.recommend import LLMUnavailableError

if TYPE_CHECKING:
    from api.config import Settings

logger = logging.getLogger("tai.llm.gemini")


def _transient_exception_types() -> tuple[type[BaseException], ...]:
    """Return the SDK's transient exception types to retry on.

    Imported lazily; if ``google.api_core`` is unavailable for any reason we
    fall back to retrying on the broad ``Exception`` so the policy stays robust.
    """
    try:
        from google.api_core.exceptions import (  # type: ignore[import-not-found]
            DeadlineExceeded,
            ResourceExhausted,
            ServiceUnavailable,
        )
    except ImportError:  # pragma: no cover - depends on optional dep internals
        return (Exception,)
    return (ResourceExhausted, ServiceUnavailable, DeadlineExceeded)


class GeminiLLMProvider(LLMProvider):
    """Calls the Google Gemini API requesting JSON output."""

    name = "gemini"

    def __init__(self, settings: Settings) -> None:
        # Imported here so `google-generativeai` is only required when selected.
        import google.generativeai as genai

        self._settings = settings
        self._model_name = settings.gemini_model
        genai.configure(api_key=settings.gemini_api_key)
        self._model = genai.GenerativeModel(
            self._model_name,
            generation_config={
                "response_mime_type": "application/json",
                "max_output_tokens": settings.max_tokens,
            },
        )

    async def complete(self, system: str, user: str, max_tokens: int) -> str:  # noqa: ARG002
        """Generate an itinerary JSON string, retrying transient failures."""
        transient = _transient_exception_types()

        @retry(
            retry=retry_if_exception_type(transient),
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=1, min=1, max=10),
            reraise=True,
        )
        async def _call() -> str:
            resp = await self._model.generate_content_async(f"{system}\n\n{user}")
            usage = getattr(resp, "usage_metadata", None)
            total_tokens = getattr(usage, "total_token_count", None)
            if total_tokens is not None:
                TOKEN_COUNTER.add(total_tokens)
                logger.info(
                    "tokens_used=%d model=%s", total_tokens, self._model_name
                )
            return resp.text or ""

        try:
            return await _call()
        except transient as exc:
            logger.warning("Gemini unavailable after retries: %s", exc)
            raise LLMUnavailableError(str(exc)) from exc
