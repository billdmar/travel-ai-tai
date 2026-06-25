"""Google Gemini-backed LLM provider (model ``gemini-2.0-flash``).

Uses the supported ``google-genai`` SDK with JSON output and a tenacity retry
policy (3 attempts, exponential backoff) on transient rate-limit / timeout /
service errors. After the retries are exhausted, behavior depends on
``Settings.gemini_fallback_to_mock`` (default true): we serve a deterministic
mock completion so the live demo always returns something even when the
free-tier quota is exhausted; with the flag off we raise
:class:`~api.recommend.LLMUnavailableError`, which the API layer maps to a
``503`` with a ``Retry-After`` header. The ``google.genai`` package is imported
lazily so it is never required for the mock path.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from api.llm.provider import TOKEN_COUNTER, LLMProvider, LLMResult
from api.recommend import LLMUnavailableError

if TYPE_CHECKING:
    from api.config import Settings

logger = logging.getLogger("tai.llm.gemini")

# HTTP status codes the SDK surfaces for transient failures worth retrying:
# 429 quota/rate-limit (was ResourceExhausted), 503 unavailable (was
# ServiceUnavailable), 504 deadline (was DeadlineExceeded). A 4xx like 400/404
# is a permanent client error and must NOT be retried.
_TRANSIENT_STATUS_CODES = frozenset({429, 503, 504})


def _is_transient(exc: BaseException) -> bool:
    """Return whether ``exc`` is a transient Gemini error worth retrying.

    ``google-genai`` raises :class:`google.genai.errors.APIError` (subclassed
    into ``ClientError`` for 4xx and ``ServerError`` for 5xx) carrying the HTTP
    status on ``.code``. We retry only the transient codes; everything else
    (permanent client errors, programming bugs) propagates immediately. The
    import is lazy so the mock path never pulls in the SDK; if it is somehow
    unavailable we retry on any ``Exception`` so the policy stays robust.
    """
    try:
        from google.genai.errors import APIError
    except ImportError:  # pragma: no cover - depends on optional dep internals
        return isinstance(exc, Exception)
    return isinstance(exc, APIError) and exc.code in _TRANSIENT_STATUS_CODES


class GeminiLLMProvider(LLMProvider):
    """Calls the Google Gemini API requesting JSON output."""

    name = "gemini"

    def __init__(self, settings: Settings) -> None:
        # Imported here so `google-genai` is only required when selected.
        from google import genai
        from google.genai import types

        self._settings = settings
        self._model_name = settings.gemini_model
        # Timeout is configured on the client (milliseconds) rather than
        # per-call as in the legacy SDK; JSON output + the token cap live in the
        # per-call GenerateContentConfig built in `complete`.
        self._client = genai.Client(
            api_key=settings.gemini_api_key,
            http_options=types.HttpOptions(
                timeout=int(settings.llm_timeout_seconds * 1000),
            ),
        )

    async def complete(self, system: str, user: str, max_tokens: int) -> LLMResult:  # noqa: ARG002
        """Generate an itinerary completion, retrying transient failures."""
        from google.genai import types

        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            max_output_tokens=self._settings.max_tokens,
        )

        @retry(
            retry=retry_if_exception(_is_transient),
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=1, min=1, max=10),
            reraise=True,
        )
        async def _call() -> LLMResult:
            resp = await self._client.aio.models.generate_content(
                model=self._model_name,
                contents=f"{system}\n\n{user}",
                config=config,
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
        except Exception as exc:
            # Only transient errors should degrade to mock / 503; a permanent
            # error (e.g. a 400 bad request) is a real bug and must surface.
            if not _is_transient(exc):
                raise
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
