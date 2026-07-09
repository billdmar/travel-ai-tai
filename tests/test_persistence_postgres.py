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

from sqlalchemy.engine import make_url

from api.config import Settings
from api.db import _normalize_postgres_url, build_engine

_PG_URL = "postgresql+asyncpg://user:pass@db.example.com:5432/tai"
_SQLITE_URL = "sqlite+aiosqlite:///./tai.db"
# A raw connection string exactly as Neon/Supabase hand it out: bare
# ``postgresql://`` scheme + libpq-only query params asyncpg cannot accept.
_RAW_PROVIDER_URL = (
    "postgresql://user:pass@ep-cool-name.us-east-2.aws.neon.tech/tai"
    "?sslmode=require&channel_binding=require"
)


def test_settings_is_postgres_flag() -> None:
    assert Settings(DATABASE_URL=_PG_URL).is_postgres is True
    assert Settings(DATABASE_URL=_SQLITE_URL).is_postgres is False


def test_default_database_url_is_sqlite(monkeypatch) -> None:
    """Out of the box (no env override) we fall back to ephemeral SQLite.

    ``_env_file=None`` disables the ``.env`` file but pydantic-settings still
    reads ``os.environ``; the ``backend-postgres`` CI job exports
    ``DATABASE_URL`` for its whole step, so clear it here to assert the true
    zero-config default rather than the job's ambient override.
    """
    monkeypatch.delenv("DATABASE_URL", raising=False)
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


def test_normalize_raw_provider_url_upgrades_driver_and_strips_libpq_params() -> None:
    """A raw provider DSN gains the +asyncpg driver, loses libpq-only params."""
    clean_url, connect_args = _normalize_postgres_url(_RAW_PROVIDER_URL)
    url = make_url(clean_url)
    assert url.drivername == "postgresql+asyncpg"
    # libpq-only params asyncpg would reject are gone...
    assert "sslmode" not in url.query
    assert "channel_binding" not in url.query
    # ...and the SSL intent is carried via asyncpg's connect arg instead.
    assert connect_args == {"ssl": True}
    # Credentials and host survive normalization.
    assert url.username == "user"
    assert url.host == "ep-cool-name.us-east-2.aws.neon.tech"
    assert url.database == "tai"


def test_normalize_already_normalized_url_is_noop() -> None:
    """An already-correct DSN (driver set, no libpq params) is unchanged."""
    clean_url, connect_args = _normalize_postgres_url(_PG_URL)
    assert clean_url == _PG_URL
    assert connect_args == {}


def test_normalize_sslmode_disable_omits_ssl_connect_arg() -> None:
    """``sslmode=disable`` must NOT force TLS on."""
    _, connect_args = _normalize_postgres_url(
        "postgresql://u:p@localhost:5432/tai?sslmode=disable"
    )
    assert "ssl" not in connect_args


def test_build_engine_raw_provider_url_passes_normalized_url_and_ssl() -> None:
    """End-to-end: build_engine feeds create_async_engine the cleaned URL+SSL."""
    with patch("api.db.create_async_engine") as mock_create:
        build_engine(_RAW_PROVIDER_URL)
    mock_create.assert_called_once()
    args, kwargs = mock_create.call_args
    assert args[0].startswith("postgresql+asyncpg://")
    assert "sslmode" not in args[0]
    assert kwargs["connect_args"] == {"ssl": True}
    assert kwargs["pool_size"] == 10
