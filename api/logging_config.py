"""Structured JSON logging wired to the request-id middleware.

``setup_logging`` installs a JSON formatter on the root logger so every log
record is emitted as a single-line JSON object that includes the current
request id (when one is set by :class:`api.middleware.RequestIDMiddleware`).
The request id lives in a module-level :class:`contextvars.ContextVar`, so the
formatter can read it without the call site having to thread it through.

Idempotent: calling ``setup_logging`` more than once (e.g. app factory plus
test harness) replaces the handler rather than stacking duplicates.
"""

from __future__ import annotations

import contextvars
import datetime as _dt
import json
import logging

#: Holds the active request id for the current async task / request. Set by the
#: RequestIDMiddleware on entry; read by the JSON formatter below.
request_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "request_id", default=None
)

_RESERVED = frozenset(
    logging.makeLogRecord({}).__dict__.keys()
) | {"message", "asctime", "taskName"}


class JsonLogFormatter(logging.Formatter):
    """Render log records as single-line JSON including the request id."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": _dt.datetime.fromtimestamp(
                record.created, tz=_dt.timezone.utc
            ).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        request_id = request_id_var.get()
        if request_id is not None:
            payload["request_id"] = request_id

        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)

        # Surface any structured extras passed via ``logger.info(..., extra=...)``.
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value

        return json.dumps(payload, default=str)


def setup_logging(level: int | str = logging.INFO) -> None:
    """Install the JSON formatter on the root logger (idempotent)."""
    root = logging.getLogger()
    root.setLevel(level)

    handler = logging.StreamHandler()
    handler.setFormatter(JsonLogFormatter())

    # Replace existing handlers so repeated calls don't duplicate output.
    for existing in list(root.handlers):
        root.removeHandler(existing)
    root.addHandler(handler)
