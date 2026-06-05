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
from sqlalchemy import DateTime, Integer, String, Text
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
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


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
