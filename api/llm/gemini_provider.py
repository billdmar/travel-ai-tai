"""Google Gemini-backed LLM provider (model ``gemini-2.0-flash``).

Uses the official ``google-generativeai`` SDK with JSON output and a tenacity
retry policy (3 attempts, exponential backoff) on transient rate-limit /
timeout / service errors. After the retries are exhausted, behavior depends on
``Settings.gemini_fallback_to_mock`` (default true): we serve a deterministic
mock completion so the live demo always returns something even when the
free-tier quota is exhausted; with the flag off we raise
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

from api.llm.provider import TOKEN_COUNTER, LLMProvider, LLMResult
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

    async def complete(self, system: str, user: str, max_tokens: int) -> LLMResult:  # noqa: ARG002
        """Generate an itinerary completion, retrying transient failures."""
        transient = _transient_exception_types()

        @retry(
            retry=retry_if_exception_type(transient),
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=1, min=1, max=10),
            reraise=True,
        )
        async def _call() -> LLMResult:
            resp = await self._model.generate_content_async(
                f"{system}\n\n{user}",
                request_options={"timeout": self._settings.llm_timeout_seconds},
            )
            usage = getattr(resp, "usage_metadata", None)
            total_tokens = getattr(usage, "total_token_count", None)
            if total_tokens is not None:
                TOKEN_COUNTER.add(total_tokens)
                logger.info(
                    "tokens_used=%d model=%s", total_tokens, self._model_name
                )
            return LLMResult(resp.text or "", tokens_used=total_tokens)

        try:
            return await _call()
        except transient as exc:
            if self._settings.gemini_fallback_to_mock:
                # ERROR (not WARNING) so the silent degrade is visible in logs
                # and picked up by Sentry; the fallback_reason propagates the
                # cause upstream (response model / response header) too.
                reason = f"gemini_unavailable: {exc}"
                logger.error(
                    "Gemini unavailable after retries (%s); serving mock fallback",
                    exc,
                )
                # MockLLMProvider branches discovery vs itinerary on the system
                # prompt, so this covers both flows with a single delegation.
                from api.llm.mock_provider import MockLLMProvider

                fallback = await MockLLMProvider().complete(system, user, max_tokens)
                return LLMResult(fallback.text, fallback_reason=reason)
            logger.error("Gemini unavailable after retries: %s", exc)
            raise LLMUnavailableError(str(exc)) from exc
