"""Opt-in error tracking via Sentry.

``init_sentry`` wires the Sentry SDK from a :class:`Settings` instance so
unhandled exceptions (and, optionally, performance traces) are reported to a
Sentry project. It is **fully opt-in**: with no ``SENTRY_DSN`` configured the
call is a no-op and the SDK is never initialised, so the live deploy behaves
exactly as before unless the DSN is explicitly set.

Mirrors the project's lazy-dependency pattern (cf. the Gemini SDK / fpdf2): the
``sentry_sdk`` import is deferred inside the function so importing this module
costs nothing on the default (DSN-less) path, and the FastAPI integration is
attached only when it imports cleanly.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from api.config import Settings

logger = logging.getLogger("tai.observability")


def init_sentry(settings: Settings) -> None:
    """Initialise Sentry error tracking when a DSN is configured.

    No-op when ``settings.sentry_dsn`` is ``None`` (the default), so production
    is unaffected unless ``SENTRY_DSN`` is explicitly provided. When a DSN is
    present, ``sentry_sdk.init`` is called with the configured traces sample
    rate and environment; the :class:`FastApiIntegration` is added when the
    integration import succeeds so request context is attached to events.
    """
    if settings.sentry_dsn is None:
        return

    import sentry_sdk

    integrations = []
    try:  # pragma: no cover - integration import is environment-dependent.
        from sentry_sdk.integrations.fastapi import FastApiIntegration

        integrations.append(FastApiIntegration())
    except ImportError:  # pragma: no cover - tolerate a slimmed SDK.
        logger.warning("sentry_fastapi_integration_unavailable", exc_info=True)

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        environment=settings.sentry_environment,
        integrations=integrations,
    )
    logger.info("sentry_initialised environment=%s", settings.sentry_environment)
