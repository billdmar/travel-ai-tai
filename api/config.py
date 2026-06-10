"""Application configuration via ``pydantic-settings``.

All runtime knobs are read from environment variables (or a local ``.env``
file) with sane defaults so the app boots with zero configuration in
development. The mock LLM provider is the default whenever no
``OPENAI_API_KEY`` is present, which keeps tests and demos network-free.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Strongly-typed application settings loaded from the environment."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── Application identity ────────────────────────────────────────────────
    version: str = "1.0.0"

    # ── LLM provider ────────────────────────────────────────────────────────
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    llm_provider: Literal["openai", "mock", "langchain", "gemini"] = Field(
        default="mock", alias="LLM_PROVIDER"
    )
    openai_model: str = Field(default="gpt-4o-mini", alias="OPENAI_MODEL")
    gemini_model: str = Field(default="gemini-2.0-flash", alias="GEMINI_MODEL")
    max_tokens: int = Field(default=2000, alias="MAX_TOKENS", gt=0)

    # ── Persistence ─────────────────────────────────────────────────────────
    database_url: str = Field(
        default="sqlite+aiosqlite:///./tai.db", alias="DATABASE_URL"
    )

    # ── Caching ─────────────────────────────────────────────────────────────
    cache_backend: Literal["memory", "redis"] = Field(
        default="memory", alias="CACHE_BACKEND"
    )
    redis_url: str | None = Field(default=None, alias="REDIS_URL")

    # ── Operations ──────────────────────────────────────────────────────────
    debug_mode: bool = Field(default=False, alias="DEBUG_MODE")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    allowed_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173"],
        alias="ALLOWED_ORIGINS",
    )
    rate_limit_enabled: bool = Field(default=True, alias="RATE_LIMIT_ENABLED")

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        """Allow ``ALLOWED_ORIGINS`` to be supplied as a CSV string."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    """Return a cached :class:`Settings` instance.

    Cached so the environment is parsed once per process. Tests that need
    bespoke settings construct :class:`Settings` directly and pass it to
    ``create_app``.
    """
    return Settings()
