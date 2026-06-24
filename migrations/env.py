"""Alembic migration environment for Travel AI (TAI).

Wired to the application's own config and persistence layer rather than the
``sqlalchemy.url`` in ``alembic.ini``:

* the target URL is read from :class:`api.config.Settings` (i.e. ``DATABASE_URL``),
  so migrations always target the same DB the app uses; and
* the *online* engine is built with :func:`api.db.build_engine`, reusing the
  exact async driver selection and hosted-Postgres DSN normalization the app
  relies on (no separate, drifting connection logic).

Alembic itself is synchronous, so we drive the async engine via
``connection.run_sync`` (the async template's ``run_async_migrations``). The
*offline* path translates the async DSN to a sync-equivalent URL for emitting
SQL without a DBAPI connection.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.engine import Connection, make_url

from api.config import get_settings
from api.db import Base, build_engine

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Autogenerate compares the live DB against the app's declarative metadata.
target_metadata = Base.metadata


def _offline_url() -> str:
    """Return a DBAPI-free, sync-driver URL for offline SQL emission.

    Offline mode emits raw SQL without connecting, so the async driver tokens
    (``+aiosqlite`` / ``+asyncpg``) are stripped to their bare dialect — the
    dialect alone determines the generated SQL.
    """
    url = make_url(get_settings().database_url)
    if url.drivername.startswith("sqlite"):
        return url.set(drivername="sqlite").render_as_string(hide_password=False)
    if url.drivername.startswith("postgresql") or url.drivername.startswith("postgres"):
        return url.set(drivername="postgresql").render_as_string(hide_password=False)
    return url.render_as_string(hide_password=False)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emit SQL, no DBAPI connection)."""
    context.configure(
        url=_offline_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    # render_as_batch keeps SQLite ALTERs (which lack native column ops) working
    # via Alembic's batch/copy-and-move strategy, matching the app's SQLite-first
    # local default while staying correct on Postgres.
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Build the app's async engine and run migrations through it."""
    connectable = build_engine(get_settings().database_url)

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
