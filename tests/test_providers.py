"""OpenAI provider retry-path tests (PLAN bead B2-PROVIDER / failure F6).

Monkeypatches an OpenAI-style provider to raise a RateLimitError twice then
succeed, asserting tenacity retries and ultimately succeeds; and that
exhaustion raises ``LLMUnavailableError`` (which the API maps to 503).

Skipped cleanly if the optional ``openai`` package is not installed — the
engine-level error mapping is covered unconditionally in ``test_recommend`` and
``test_itineraries`` via injected fake providers.
"""

from __future__ import annotations

import pytest

from api.config import Settings
from api.llm.provider import LLMProvider, get_provider
from api.recommend import LLMUnavailableError

openai = pytest.importorskip("openai")


class _FakeUsage:
    total_tokens = 42


class _FakeMessage:
    content = '{"ok": true}'


class _FakeChoice:
    message = _FakeMessage()


class _FakeResponse:
    usage = _FakeUsage()
    choices = [_FakeChoice()]


def _make_rate_limit_error() -> Exception:
    """Construct an openai.RateLimitError without a live HTTP response."""
    try:
        return openai.RateLimitError(
            message="slow down", response=None, body=None
        )
    except Exception:
        # Fallback: instantiate via __new__ if the signature differs.
        err = openai.RateLimitError.__new__(openai.RateLimitError)
        Exception.__init__(err, "slow down")
        return err


def _provider() -> LLMProvider:
    settings = Settings(LLM_PROVIDER="openai", OPENAI_API_KEY="sk-test")
    return get_provider(settings)


def _patch_no_wait(monkeypatch) -> None:
    """Replace tenacity's exponential backoff with a zero wait for speed."""
    from tenacity import wait_none

    import api.llm.openai_provider as op

    monkeypatch.setattr(op, "wait_exponential", lambda **_kw: wait_none())


async def test_retries_twice_then_succeeds(monkeypatch) -> None:
    provider = _provider()
    assert provider.name == "openai"

    calls = {"n": 0}

    async def _create(*args, **kwargs):  # noqa: ARG001
        calls["n"] += 1
        if calls["n"] < 3:
            raise _make_rate_limit_error()
        return _FakeResponse()

    # Patch the underlying client's create coroutine.
    provider._client.chat.completions.create = _create  # type: ignore[attr-defined]

    _patch_no_wait(monkeypatch)

    out = await provider.complete(system="s", user="u", max_tokens=100)
    assert out.text == '{"ok": true}'
    # OpenAI usage is propagated onto the result so the engine can persist it.
    assert out.tokens_used == 42
    assert calls["n"] == 3


async def test_exhaustion_raises_llm_unavailable(monkeypatch) -> None:
    provider = _provider()

    async def _always_fail(*args, **kwargs):  # noqa: ARG001
        raise _make_rate_limit_error()

    provider._client.chat.completions.create = _always_fail  # type: ignore[attr-defined]

    _patch_no_wait(monkeypatch)

    with pytest.raises(LLMUnavailableError):
        await provider.complete(system="s", user="u", max_tokens=100)
