"""Thin LangChain-backed LLM provider (optional, env-gated).

Wraps ``langchain_openai.ChatOpenAI`` to satisfy the LangChain skills tag
without disturbing the primary OpenAI SDK path. ``langchain-openai`` is NOT a
core dependency, so the import is guarded and raises a clear, actionable error
if this provider is selected without it installed.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from api.llm.provider import LLMProvider
from api.recommend import LLMUnavailableError

if TYPE_CHECKING:
    from api.config import Settings

logger = logging.getLogger("tai.llm.langchain")


class LangChainLLMProvider(LLMProvider):
    """Generates itineraries through ``langchain_openai.ChatOpenAI``."""

    name = "langchain"

    def __init__(self, settings: Settings) -> None:
        try:
            from langchain_openai import ChatOpenAI
        except ImportError as exc:  # pragma: no cover - depends on optional dep
            raise RuntimeError(
                "LLM_PROVIDER=langchain requires the optional 'langchain-openai' "
                "package. Install it with `pip install -r requirements-langchain.txt` "
                "(or `pip install langchain-openai`)."
            ) from exc

        self._settings = settings
        self._model = ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            max_tokens=settings.max_tokens,
            model_kwargs={"response_format": {"type": "json_object"}},
        )

    async def complete(self, system: str, user: str, max_tokens: int) -> str:  # noqa: ARG002
        """Invoke the LangChain chat model and return its JSON content."""
        from langchain_core.messages import HumanMessage, SystemMessage

        try:
            result = await self._model.ainvoke(
                [SystemMessage(content=system), HumanMessage(content=user)]
            )
        except Exception as exc:  # pragma: no cover - network path
            logger.warning("LangChain provider failed: %s", exc)
            raise LLMUnavailableError(str(exc)) from exc

        content = result.content
        return content if isinstance(content, str) else str(content)
