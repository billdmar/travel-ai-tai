"""Async SQLAlchemy 2.0 persistence layer.

Defines the declarative ``Base``, the :class:`ItineraryRecord` ORM model, and
helpers to build an async engine / session factory from settings. The engine
is created inside the application factory (never at import time) so tests can
inject an in-memory ``StaticPool`` engine and override the ``get_session``
dependency without touching module globals.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import AsyncIterator

from fastapi import Request
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


class ItineraryRecord(Base):
    """Persisted itinerary: server-owned fields + serialized JSON payloads."""

    __tablename__ = "itinerary_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    # Indexed: the Saved list orders by created_at DESC (see
    # api/routes/itineraries.py list_itineraries) so the most-recent page can be
    # served from the index rather than a full scan + sort.
    #
    # Server-owned timestamp: the database stamps the insert via its own
    # ``now()`` (server_default) so the value is authoritative at the DB and
    # consistent across app instances/clocks — the engine no longer sets it in
    # Python. ``func.now()`` is timezone-aware on Postgres (the documented prod
    # backend); the app reads it back via ``session.refresh`` after insert.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True, server_default=func.now()
    )
    preferences_json: Mapped[str] = mapped_column(Text)
    itinerary_json: Mapped[str] = mapped_column(Text)
    provider: Mapped[str] = mapped_column(String(32))
    tokens_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Explicit-save marker: NULL for drafts (generation always persists, but a
    # row only appears in the Saved list once the user saves it). Schema changes
    # like this column are now managed by Alembic (see migrations/): run
    # `alembic upgrade head` to bring an existing DB up to date — no manual
    # ALTER TABLE. A fresh DB created via create_all already has it.
    # Indexed: the Saved list filters on `saved_at IS NOT NULL`, so the index
    # lets that predicate skip the (potentially many) unsaved drafts.
    saved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class ShareTokenRecord(Base):
    """Opaque share token → itinerary mapping for public read-only links.

    A token is minted on demand for an itinerary and persisted in the same DB,
    so it survives a restart exactly like the itinerary it points at. The
    public ``GET /shared/{token}`` route resolves a token to its itinerary and
    returns a read-only response.
    """

    __tablename__ = "share_tokens"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    itinerary_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("itinerary_records.id", ondelete="CASCADE"),
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Destination(Base):
    """Curated Explore-gallery destination — editorial copy + bundled-asset key.

    This is the DB-backed source for the ``GET /api/v1/destinations/curated``
    endpoint that replaces the frontend's hardcoded ``DESTINATIONS`` array. Each
    column mirrors a field of the frontend ``CuratedDestination`` interface
    (web/src/components/explore/destinations.ts): ``slug`` is the bundled-asset
    key + URL route param, ``query`` is handed to the image service/matcher, and
    ``vibes``/``story`` are short JSON lists (the ``JSON`` type maps to ``TEXT``
    on SQLite and native ``jsonb``-adjacent ``JSON`` on Postgres).

    This is editorial discovery copy — NOT the LLM recommendation contract
    (``DestinationRecommendation``), which stays server-generated.
    """

    __tablename__ = "destinations"

    # Bundled-asset slug + URL route param (/destination/:slug); the natural key.
    slug: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    country: Mapped[str] = mapped_column(String(128))
    # Free-text query handed to the live image service / asset matcher.
    query: Mapped[str] = mapped_column(String(128))
    # Short editorial line shown on the gallery card.
    tagline: Mapped[str] = mapped_column(Text)
    # Best window to visit (mirrors DestinationRecommendation.best_season).
    best_season: Mapped[str] = mapped_column(Text)
    # Filterable vibes (list[str]) and the immersive landing-page story
    # (list[str], two-to-three sentences) — both small JSON arrays.
    vibes: Mapped[list[str]] = mapped_column(JSON)
    story: Mapped[list[str]] = mapped_column(JSON)
    # The gallery's deliberate editorial order (not alphabetical): the endpoint
    # returns rows sorted by this ascending so the curated rhythm is preserved.
    # Indexed because the list query's sole ORDER BY is on this column.
    sort_order: Mapped[int] = mapped_column(Integer, index=True)


# libpq-only query params that hosted Postgres providers (Neon, Supabase, …)
# append to the DSN they hand you. The asyncpg driver does not understand them
# and raises ``TypeError: connect() got an unexpected keyword argument`` — so we
# strip them from the URL and translate the SSL intent into asyncpg connect args.
_LIBPQ_ONLY_QUERY_KEYS = ("sslmode", "channel_binding", "options")


def _normalize_postgres_url(database_url: str) -> tuple[str, dict[str, object]]:
    """Make a hosted-provider Postgres DSN drivable by SQLAlchemy + asyncpg.

    Providers (Neon/Supabase/Render) give you a *plain* ``postgresql://`` URL,
    often with ``?sslmode=require`` (and Neon's ``channel_binding``). SQLAlchemy's
    async engine needs the ``+asyncpg`` driver, and asyncpg rejects the libpq-only
    query params. This upgrades the scheme and converts ``sslmode`` into the
    ``ssl`` connect arg, returning ``(clean_url, connect_args)``.
    """
    url = make_url(database_url)
    if "+" not in url.drivername:  # bare "postgresql" / "postgres" → add driver.
        url = url.set(drivername="postgresql+asyncpg")

    query = dict(url.query)
    sslmode = query.get("sslmode")
    for key in _LIBPQ_ONLY_QUERY_KEYS:
        query.pop(key, None)
    url = url.set(query=query)

    connect_args: dict[str, object] = {}
    # Any sslmode other than an explicit "disable" means: require TLS. asyncpg
    # takes an ``ssl`` flag, not libpq's sslmode string.
    if sslmode is not None and sslmode != "disable":
        connect_args["ssl"] = True

    return url.render_as_string(hide_password=False), connect_args


def build_engine(database_url: str) -> AsyncEngine:
    """Create an async engine, auto-sizing the pool for SQLite vs. Postgres.

    Postgres DSNs from hosted providers are normalized first (driver upgraded,
    libpq-only query params translated) so a raw provider connection string can
    be pasted into ``DATABASE_URL`` without manual editing.
    """
    if database_url.startswith("sqlite"):
        # SQLite uses a single connection; pool sizing args do not apply.
        return create_async_engine(database_url, future=True)
    # Postgres-ready connection pooling for the "scalable" story.
    normalized_url, connect_args = _normalize_postgres_url(database_url)
    return create_async_engine(
        normalized_url,
        future=True,
        pool_size=10,
        max_overflow=20,
        connect_args=connect_args,
    )


def build_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Create an ``async_sessionmaker`` bound to ``engine``."""
    return async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def create_all(engine: AsyncEngine) -> None:
    """Create all tables (used by the app lifespan and the test harness)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


# Repo root holds alembic.ini and the migrations/ dir (api/ is one level down).
_ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


def _upgrade_to_head() -> None:
    """Synchronously run ``alembic upgrade head`` (alembic is sync-only).

    Reads ``alembic.ini`` at the repo root; ``migrations/env.py`` reads the
    target DB from settings and builds the engine via :func:`build_engine`, so
    no URL needs threading through here.
    """
    from alembic import command
    from alembic.config import Config

    command.upgrade(Config(str(_ALEMBIC_INI)), "head")


async def run_migrations() -> None:
    """Bring the configured database to the latest schema via Alembic.

    Alembic's ``command.upgrade`` is synchronous and its async ``env.py`` calls
    ``asyncio.run`` internally, which would explode if invoked on the running
    event loop — so we hand it to a worker thread. Used by the app lifespan for
    Postgres (the documented prod backend); SQLite/dev keeps using
    :func:`create_all`.
    """
    import asyncio

    await asyncio.to_thread(_upgrade_to_head)


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding a session from the app-state sessionmaker.

    The sessionmaker is stored on ``app.state`` by the application factory.
    Tests override this dependency to inject their own session.
    """
    sessionmaker: async_sessionmaker[AsyncSession] = (
        request.app.state.sessionmaker
    )
    async with sessionmaker() as session:
        yield session
