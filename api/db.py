"""Async SQLAlchemy 2.0 persistence layer.

Defines the declarative ``Base``, the :class:`ItineraryRecord` ORM model, and
helpers to build an async engine / session factory from settings. The engine
is created inside the application factory (never at import time) so tests can
inject an in-memory ``StaticPool`` engine and override the ``get_session``
dependency without touching module globals.
"""

from __future__ import annotations

from datetime import datetime
from typing import AsyncIterator

from fastapi import Request
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    preferences_json: Mapped[str] = mapped_column(Text)
    itinerary_json: Mapped[str] = mapped_column(Text)
    provider: Mapped[str] = mapped_column(String(32))
    tokens_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Explicit-save marker: NULL for drafts (generation always persists, but a
    # row only appears in the Saved list once the user saves it). NOTE: existing
    # SQLite DBs created before this column was added need a manual
    # `ALTER TABLE itinerary_records ADD COLUMN saved_at DATETIME` — a fresh DB
    # (created via create_all) already has it.
    saved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
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
        String(36), ForeignKey("itinerary_records.id"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


def build_engine(database_url: str) -> AsyncEngine:
    """Create an async engine, auto-sizing the pool for SQLite vs. Postgres."""
    if database_url.startswith("sqlite"):
        # SQLite uses a single connection; pool sizing args do not apply.
        return create_async_engine(database_url, future=True)
    # Postgres-ready connection pooling for the "scalable" story.
    return create_async_engine(
        database_url, future=True, pool_size=10, max_overflow=20
    )


def build_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Create an ``async_sessionmaker`` bound to ``engine``."""
    return async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def create_all(engine: AsyncEngine) -> None:
    """Create all tables (used by the app lifespan and the test harness)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


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
