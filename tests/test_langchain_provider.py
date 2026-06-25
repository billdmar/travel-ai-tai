"""Unit tests for :class:`api.llm.langchain_provider.LangChainLLMProvider`.

``langchain-openai`` is an optional dependency that is NOT installed in the test
environment, so these tests install minimal fake ``langchain_openai`` and
``langchain_core.messages`` modules via monkeypatch (mirroring the fake-SDK
approach in ``tests/test_gemini_fallback.py``). That keeps them hermetic and
network-free while still exercising the real provider code: construction,
mapping a model response into an :class:`LLMResult` (text + token usage), and
the error/fallback path that raises :class:`LLMUnavailableError`.
"""

from __future__ import annotations

import sys
import types

import pytest

from api.config import Settings
from api.llm.provider import LLMResult
from api.recommend import LLMUnavailableError


class _FakeChatOpenAI:
    """Stand-in for ``langchain_openai.ChatOpenAI``.

    Records constructor kwargs so a test can assert settings are threaded
    through, and returns whatever ``ainvoke`` is told to (a response object or a
    raised exception) so each test controls the per-call behaviour.
    """

    last_init_kwargs: dict | None = None

    def __init__(self, **kwargs) -> None:  # noqa: ANN003
        type(self).last_init_kwargs = kwargs
        self._response = None
        self._exc: Exception | None = None

    async def ainvoke(self, _messages):  # noqa: ANN001
        if self._exc is not None:
            raise self._exc
        return self._response


def _install_fake_langchain(monkeypatch: pytest.MonkeyPatch) -> None:
    """Install fake ``langchain_openai`` + ``langchain_core.messages`` modules."""
    fake_openai = types.ModuleType("langchain_openai")
    fake_openai.ChatOpenAI = _FakeChatOpenAI  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "langchain_openai", fake_openai)

    # The provider imports HumanMessage/SystemMessage from langchain_core.messages
    # at call time; trivial record types are enough for the stub.
    core_pkg = sys.modules.get("langchain_core") or types.ModuleType("langchain_core")
    messages_mod = types.ModuleType("langchain_core.messages")

    class _Message:
        def __init__(self, content) -> None:  # noqa: ANN001
            self.content = content

    messages_mod.SystemMessage = _Message  # type: ignore[attr-defined]
    messages_mod.HumanMessage = _Message  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "langchain_core", core_pkg)
    monkeypatch.setitem(sys.modules, "langchain_core.messages", messages_mod)


def _provider(monkeypatch: pytest.MonkeyPatch):
    _install_fake_langchain(monkeypatch)
    from api.llm.langchain_provider import LangChainLLMProvider

    settings = Settings(LLM_PROVIDER="langchain", OPENAI_API_KEY="test-key")
    return LangChainLLMProvider(settings)


def test_name_is_langchain(monkeypatch: pytest.MonkeyPatch) -> None:
    provider = _provider(monkeypatch)
    assert provider.name == "langchain"


def test_construction_threads_settings_into_chat_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The ChatOpenAI client is built from model/key/max_tokens settings."""
    _provider(monkeypatch)
    kwargs = _FakeChatOpenAI.last_init_kwargs
    assert kwargs is not None
    assert kwargs["model"] == "gpt-4o-mini"
    assert kwargs["api_key"] == "test-key"
    assert kwargs["max_tokens"] == 2000
    # JSON-object response format keeps the completion machine-parseable.
    assert kwargs["model_kwargs"] == {"response_format": {"type": "json_object"}}


async def test_complete_maps_response_to_llmresult(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider(monkeypatch)
    provider._model._response = types.SimpleNamespace(
        content='{"days": []}',
        usage_metadata={"total_tokens": 321},
    )

    result = await provider.complete(system="sys", user="usr", max_tokens=500)

    assert isinstance(result, LLMResult)
    assert result.text == '{"days": []}'
    assert result.tokens_used == 321
    assert result.fallback_reason is None


async def test_complete_tokens_none_when_no_usage_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Backends that don't report usage leave ``tokens_used`` as None."""
    provider = _provider(monkeypatch)
    provider._model._response = types.SimpleNamespace(
        content='{"days": []}', usage_metadata=None
    )

    result = await provider.complete(system="sys", user="usr", max_tokens=500)

    assert result.text == '{"days": []}'
    assert result.tokens_used is None


async def test_complete_stringifies_non_string_content(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """LangChain can return content as a list of parts; we coerce to str."""
    provider = _provider(monkeypatch)
    provider._model._response = types.SimpleNamespace(
        content=[{"type": "text", "text": "hi"}],
        usage_metadata={"total_tokens": 5},
    )

    result = await provider.complete(system="sys", user="usr", max_tokens=500)

    assert result.text == str([{"type": "text", "text": "hi"}])
    assert result.tokens_used == 5


async def test_complete_raises_llm_unavailable_on_failure(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A model error is wrapped as LLMUnavailableError and logged at WARNING."""
    provider = _provider(monkeypatch)
    provider._model._exc = RuntimeError("upstream 503")

    with caplog.at_level("WARNING", logger="tai.llm.langchain"):
        with pytest.raises(LLMUnavailableError, match="upstream 503"):
            await provider.complete(system="sys", user="usr", max_tokens=500)

    assert any(
        "LangChain provider failed" in rec.getMessage() for rec in caplog.records
    )


def test_construction_raises_actionable_error_when_dep_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Selecting the provider without langchain-openai gives a clear error."""
    # Ensure the import fails: remove any (real or faked) langchain_openai.
    monkeypatch.setitem(sys.modules, "langchain_openai", None)
    from api.llm.langchain_provider import LangChainLLMProvider

    settings = Settings(LLM_PROVIDER="langchain", OPENAI_API_KEY="test-key")
    with pytest.raises(RuntimeError, match="requires the optional 'langchain-openai'"):
        LangChainLLMProvider(settings)
