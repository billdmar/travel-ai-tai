"""Postgres code-path selection tests (no live Postgres / asyncpg required).

CI has no Postgres server and the ``asyncpg`` driver is not a build dependency,
so these tests assert the *selection logic* rather than a live connection:

* a ``postgresql+asyncpg://`` DATABASE_URL flips ``Settings.is_postgres``;
* ``build_engine`` takes the pooled branch for a postgres URL (``pool_size`` /
  ``max_overflow`` passed to ``create_async_engine``) and the poolless branch
  for sqlite.

The real persistence round-trip (write → restart → read), including share
tokens, is exercised against file-backed SQLite in ``test_persistence_restart.py``
and ``test_share.py``; the ORM is dialect-agnostic, so SQLite covers the data
path and these tests cover the postgres engine wiring.
"""

from __future__ import annotations

from unittest.mock import patch

from api.config import Settings
from api.db import build_engine

_PG_URL = "postgresql+asyncpg://user:pass@db.example.com:5432/tai"
_SQLITE_URL = "sqlite+aiosqlite:///./tai.db"


def test_settings_is_postgres_flag() -> None:
    assert Settings(DATABASE_URL=_PG_URL).is_postgres is True
    assert Settings(DATABASE_URL=_SQLITE_URL).is_postgres is False


def test_default_database_url_is_sqlite() -> None:
    """Out of the box (no env override) we fall back to ephemeral SQLite."""
    assert Settings(_env_file=None).is_postgres is False


def test_build_engine_postgres_branch_enables_pooling() -> None:
    """A postgres URL routes to the pooled ``create_async_engine`` call."""
    with patch("api.db.create_async_engine") as mock_create:
        build_engine(_PG_URL)
    mock_create.assert_called_once()
    args, kwargs = mock_create.call_args
    assert args[0] == _PG_URL
    assert kwargs["pool_size"] == 10
    assert kwargs["max_overflow"] == 20


def test_build_engine_sqlite_branch_is_poolless() -> None:
    """A sqlite URL routes to the poolless branch (no pool sizing kwargs)."""
    with patch("api.db.create_async_engine") as mock_create:
        build_engine(_SQLITE_URL)
    mock_create.assert_called_once()
    args, kwargs = mock_create.call_args
    assert args[0] == _SQLITE_URL
    assert "pool_size" not in kwargs
    assert "max_overflow" not in kwargs
