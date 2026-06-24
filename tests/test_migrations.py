"""Alembic migration smoke tests.

Confirms the baseline migration is wired correctly:

* ``alembic upgrade head`` against a scratch file-backed SQLite DB recreates
  the expected tables (the same ones ``Base.metadata.create_all`` would); and
* a fresh autogenerate diff against the ORM models is EMPTY — i.e. the
  migration history has not drifted from ``api.db.Base.metadata`` (this catches
  a model change that forgot a follow-up migration).
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine

from api.config import get_settings
from api.db import Base

_REPO_ROOT = Path(__file__).resolve().parent.parent
_ALEMBIC_INI = _REPO_ROOT / "alembic.ini"


@pytest.fixture
def scratch_db_url(tmp_path, monkeypatch):
    """Point Alembic + settings at a scratch file SQLite DB for one test.

    ``migrations/env.py`` reads the URL from ``get_settings()``, so we set
    ``DATABASE_URL`` and clear the (lru-cached) settings both before and after
    the test — monkeypatch restores the env var but not the cache.
    """
    url = f"sqlite+aiosqlite:///{tmp_path / 'migrate.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    get_settings.cache_clear()
    yield url
    get_settings.cache_clear()


def test_upgrade_head_creates_expected_tables(scratch_db_url) -> None:
    db_file = scratch_db_url.split("///", 1)[1]
    cfg = Config(str(_ALEMBIC_INI))

    command.upgrade(cfg, "head")

    conn = sqlite3.connect(db_file)
    try:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
    finally:
        conn.close()
    # Alembic stamps its version table alongside the app's tables.
    assert {"itinerary_records", "share_tokens", "alembic_version"} <= tables


def test_no_model_drift_after_upgrade(scratch_db_url) -> None:
    db_file = scratch_db_url.split("///", 1)[1]
    cfg = Config(str(_ALEMBIC_INI))

    command.upgrade(cfg, "head")

    # Re-open the upgraded DB with a plain sync engine and diff the live schema
    # against the ORM metadata. An empty diff means head == models (no drift).
    sync_engine = create_engine(f"sqlite:///{db_file}")
    try:
        with sync_engine.connect() as connection:
            ctx = MigrationContext.configure(connection)
            diff = compare_metadata(ctx, Base.metadata)
    finally:
        sync_engine.dispose()
    assert diff == [], f"unexpected schema drift: {diff}"
