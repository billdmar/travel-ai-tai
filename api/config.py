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
    version: str = "1.1.0"

    # ── LLM provider ────────────────────────────────────────────────────────
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    anthropic_api_key: str | None = Field(
        default=None, alias="ANTHROPIC_API_KEY"
    )
    llm_provider: Literal["openai", "mock", "langchain", "gemini", "anthropic"] = Field(
        default="mock", alias="LLM_PROVIDER"
    )
    openai_model: str = Field(default="gpt-4o-mini", alias="OPENAI_MODEL")
    gemini_model: str = Field(default="gemini-2.0-flash", alias="GEMINI_MODEL")
    anthropic_model: str = Field(
        default="claude-sonnet-4-20250514", alias="ANTHROPIC_MODEL"
    )
    max_tokens: int = Field(default=2000, alias="MAX_TOKENS", gt=0)
    # When a Gemini call fails after retries (e.g. free-tier quota / 429), serve a
    # mock result instead of a 503 so the live demo always returns something.
    gemini_fallback_to_mock: bool = Field(
        default=True, alias="GEMINI_FALLBACK_TO_MOCK"
    )
    # Upper bound (seconds) for a single LLM generation call before it is
    # treated as a failure. BE-HARDEN / providers enforce this.
    llm_timeout_seconds: float = Field(
        default=30.0, alias="LLM_TIMEOUT_SECONDS", gt=0
    )

    # ── Outbound HTTP ───────────────────────────────────────────────────────
    # Timeout (seconds) for outbound HTTP calls (e.g. the Unsplash image proxy).
    http_timeout_seconds: float = Field(
        default=10.0, alias="HTTP_TIMEOUT_SECONDS", gt=0
    )

    # ── Images (Unsplash proxy) ─────────────────────────────────────────────
    unsplash_access_key: str | None = Field(
        default=None, alias="UNSPLASH_ACCESS_KEY"
    )

    # ── Affiliate tag slots ─────────────────────────────────────────────────
    # Config-driven placeholders, empty by default. With an empty slot we emit a
    # clean plain deep link with NO tracking params; populate a slot to earn.
    affiliate_tag_viator: str = Field(default="", alias="AFFILIATE_TAG_VIATOR")
    affiliate_tag_gyg: str = Field(default="", alias="AFFILIATE_TAG_GYG")
    affiliate_tag_booking: str = Field(default="", alias="AFFILIATE_TAG_BOOKING")
    affiliate_tag_flights: str = Field(default="", alias="AFFILIATE_TAG_FLIGHTS")

    # ── Persistence ─────────────────────────────────────────────────────────
    # In prod set DATABASE_URL to a postgres DSN
    # (postgresql+asyncpg://user:pass@host:5432/tai); when unset we fall back to
    # an ephemeral local SQLite file. ``is_postgres`` lets callers branch on the
    # selected backend without re-parsing the URL.
    database_url: str = Field(
        default="sqlite+aiosqlite:///./tai.db", alias="DATABASE_URL"
    )

    @property
    def is_postgres(self) -> bool:
        """True when DATABASE_URL points at Postgres rather than SQLite."""
        return self.database_url.startswith("postgres")

    # ── Caching ─────────────────────────────────────────────────────────────
    cache_backend: Literal["memory", "redis"] = Field(
        default="memory", alias="CACHE_BACKEND"
    )
    redis_url: str | None = Field(default=None, alias="REDIS_URL")

    # ── Operations ──────────────────────────────────────────────────────────
    # Upper bound (seconds) for a single ``/ready`` dependency probe (DB / cache)
    # before it is treated as unreachable, so a hung backend reports not-ready
    # instead of making the readiness endpoint itself hang.
    health_check_timeout_seconds: float = Field(
        default=2.0, alias="HEALTH_CHECK_TIMEOUT_SECONDS", gt=0
    )
    debug_mode: bool = Field(default=False, alias="DEBUG_MODE")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    allowed_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173"],
        alias="ALLOWED_ORIGINS",
    )
    rate_limit_enabled: bool = Field(default=True, alias="RATE_LIMIT_ENABLED")
    # Opt-in Prometheus metrics. When false (default) the MetricsMiddleware and
    # the ``/metrics`` route are not wired, so dev/local/prod stay quiet and the
    # live deploy behavior is unchanged unless this is explicitly enabled.
    enable_metrics: bool = Field(default=False, alias="ENABLE_METRICS")

    # ── Error tracking (Sentry) ─────────────────────────────────────────────
    # Fully opt-in: with no DSN, ``init_sentry`` is a no-op and the SDK never
    # loads, so the live deploy is unchanged. Set SENTRY_DSN (a dashboard-only
    # secret) to enable unhandled-exception reporting.
    sentry_dsn: str | None = Field(default=None, alias="SENTRY_DSN")
    sentry_traces_sample_rate: float = Field(
        default=0.0, alias="SENTRY_TRACES_SAMPLE_RATE", ge=0.0, le=1.0
    )
    sentry_environment: str = Field(
        default="production", alias="SENTRY_ENVIRONMENT"
    )

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
