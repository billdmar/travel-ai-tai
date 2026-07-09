"""Anthropic provider retry-path tests.

Monkeypatches an Anthropic-style provider to raise a RateLimitError twice then
succeed, asserting tenacity retries and ultimately succeeds; and that
exhaustion raises ``LLMUnavailableError`` (which the API maps to 503).

Skipped cleanly if the optional ``anthropic`` package is not installed.
"""

from __future__ import annotations

import pytest

from api.config import Settings
from api.llm.provider import LLMProvider, get_provider
from api.recommend import LLMUnavailableError

anthropic = pytest.importorskip("anthropic")


class _FakeUsage:
    input_tokens = 30
    output_tokens = 12


class _FakeTextBlock:
    text = '{"ok": true}'
    type = "text"


class _FakeResponse:
    content = [_FakeTextBlock()]
    usage = _FakeUsage()


def _make_rate_limit_error() -> Exception:
    """Construct an anthropic.RateLimitError without a live HTTP response."""
    import httpx

    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx.Response(status_code=429, text="rate limited", request=request)
    return anthropic.RateLimitError(
        message="slow down",
        response=response,
        body=None,
    )


def _make_timeout_error() -> Exception:
    """Construct an anthropic.APITimeoutError."""
    import httpx

    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    return anthropic.APITimeoutError(request=request)


def _provider() -> LLMProvider:
    settings = Settings(LLM_PROVIDER="anthropic", ANTHROPIC_API_KEY="sk-ant-test")
    return get_provider(settings)


def _patch_no_wait(monkeypatch) -> None:
    """Replace tenacity's exponential backoff with a zero wait for speed."""
    from tenacity import wait_none

    import api.llm.anthropic_provider as ap

    monkeypatch.setattr(ap, "wait_exponential", lambda **_kw: wait_none())


@pytest.mark.asyncio
async def test_successful_completion(monkeypatch) -> None:
    """Successful call returns correct LLMResult with text and tokens."""
    provider = _provider()
    assert provider.name == "anthropic"

    async def _create(*args, **kwargs):  # noqa: ARG001
        return _FakeResponse()

    provider._client.messages.create = _create  # type: ignore[attr-defined]

    out = await provider.complete(system="s", user="u", max_tokens=100)
    assert out.text == '{"ok": true}'
    assert out.tokens_used == 42  # 30 + 12


@pytest.mark.asyncio
async def test_retries_twice_then_succeeds(monkeypatch) -> None:
    """Retries on RateLimitError and then succeeds on third attempt."""
    provider = _provider()

    calls = {"n": 0}

    async def _create(*args, **kwargs):  # noqa: ARG001
        calls["n"] += 1
        if calls["n"] < 3:
            raise _make_rate_limit_error()
        return _FakeResponse()

    provider._client.messages.create = _create  # type: ignore[attr-defined]
    _patch_no_wait(monkeypatch)

    out = await provider.complete(system="s", user="u", max_tokens=100)
    assert out.text == '{"ok": true}'
    assert out.tokens_used == 42
    assert calls["n"] == 3


@pytest.mark.asyncio
async def test_exhaustion_raises_llm_unavailable(monkeypatch) -> None:
    """Raises LLMUnavailableError after all retries are exhausted."""
    provider = _provider()

    async def _always_fail(*args, **kwargs):  # noqa: ARG001
        raise _make_rate_limit_error()

    provider._client.messages.create = _always_fail  # type: ignore[attr-defined]
    _patch_no_wait(monkeypatch)

    with pytest.raises(LLMUnavailableError):
        await provider.complete(system="s", user="u", max_tokens=100)


@pytest.mark.asyncio
async def test_timeout_retries_then_unavailable(monkeypatch) -> None:
    """APITimeoutError also triggers retry and raises LLMUnavailableError."""
    provider = _provider()

    async def _always_timeout(*args, **kwargs):  # noqa: ARG001
        raise _make_timeout_error()

    provider._client.messages.create = _always_timeout  # type: ignore[attr-defined]
    _patch_no_wait(monkeypatch)

    with pytest.raises(LLMUnavailableError):
        await provider.complete(system="s", user="u", max_tokens=100)


@pytest.mark.asyncio
async def test_token_counting(monkeypatch) -> None:
    """Tokens are correctly summed from input_tokens + output_tokens."""
    provider = _provider()

    class _CustomUsage:
        input_tokens = 100
        output_tokens = 50

    class _CustomResponse:
        content = [_FakeTextBlock()]
        usage = _CustomUsage()

    async def _create(*args, **kwargs):  # noqa: ARG001
        return _CustomResponse()

    provider._client.messages.create = _create  # type: ignore[attr-defined]

    out = await provider.complete(system="s", user="u", max_tokens=200)
    assert out.tokens_used == 150  # 100 + 50


def test_fallback_to_mock_without_key() -> None:
    """Falls back to mock when no ANTHROPIC_API_KEY is provided."""
    settings = Settings(LLM_PROVIDER="anthropic")
    provider = get_provider(settings)
    assert provider.name == "mock"
