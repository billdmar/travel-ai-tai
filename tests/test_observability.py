"""Tests for the opt-in Sentry error-tracking wiring (api.observability).

The contract is: ``init_sentry`` must be a no-op when no DSN is configured (the
default — so the live deploy is untouched) and must call ``sentry_sdk.init``
with the configured DSN / sample rate / environment when a DSN is present. Both
paths are exercised by spying on ``sentry_sdk.init`` rather than reaching the
network.
"""

from __future__ import annotations

import sentry_sdk

from api.config import Settings
from api.observability import init_sentry


def test_init_sentry_no_dsn_is_noop(monkeypatch) -> None:
    """With no SENTRY_DSN, init_sentry must not call sentry_sdk.init."""
    calls: list[dict] = []
    monkeypatch.setattr(sentry_sdk, "init", lambda **kwargs: calls.append(kwargs))

    init_sentry(Settings(SENTRY_DSN=None))

    assert calls == []


def test_init_sentry_with_dsn_calls_init(monkeypatch) -> None:
    """With a DSN set, init_sentry calls sentry_sdk.init with the settings."""
    calls: list[dict] = []
    monkeypatch.setattr(sentry_sdk, "init", lambda **kwargs: calls.append(kwargs))

    dsn = "https://public@o0.ingest.sentry.io/1"
    init_sentry(
        Settings(
            SENTRY_DSN=dsn,
            SENTRY_TRACES_SAMPLE_RATE=0.25,
            SENTRY_ENVIRONMENT="staging",
        )
    )

    assert len(calls) == 1
    kwargs = calls[0]
    assert kwargs["dsn"] == dsn
    assert kwargs["traces_sample_rate"] == 0.25
    assert kwargs["environment"] == "staging"
