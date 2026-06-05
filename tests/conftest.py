"""Shared pytest fixtures for the Travel AI test suite.

Provides:

* ``test_settings`` — a :class:`Settings` instance forcing the mock LLM
  provider, disabled rate limiting, and an in-memory StaticPool SQLite DB so
  every test runs network-free and isolated.
* ``app`` — the application built via ``create_app(test_settings)`` with the
  ``get_session`` dependency overridden to inject the test sessionmaker.
* ``client`` — an ``httpx.AsyncClient`` driven through ``ASGITransport`` and
  wrapped in ``asgi-lifespan``'s ``LifespanManager`` (the app lifespan runs DB
  init), per PLAN adversarial-review #7.
* an autouse fixture that creates all tables before and drops them after each
  test (PLAN #2 — ``Base.metadata.create_all``, not Alembic).
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from api.config import Settings
from api.db import Base, get_session
from api.main import create_app


@pytest.fixture
def test_settings() -> Settings:
    """Test settings: mock provider, no rate limiting, in-memory DB."""
    return Settings(
        LLM_PROVIDER="mock",
        OPENAI_API_KEY=None,
        RATE_LIMIT_ENABLED=False,
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        CACHE_BACKEND="memory",
        DEBUG_MODE=False,
    )


@pytest.fixture
def engine(test_settings: Settings):
    """A single StaticPool in-memory engine shared across the test (PLAN #2)."""
    return create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )


@pytest.fixture
def sessionmaker(engine) -> async_sessionmaker:
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture(autouse=True)
async def _create_schema(engine) -> AsyncIterator[None]:
    """Create all tables before each test, drop them after (PLAN #2)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
def app(test_settings: Settings, engine, sessionmaker):
    """App built via the factory, with the test DB injected.

    We replace the engine/sessionmaker the factory built (which the lifespan
    ``create_all`` runs against) with the test StaticPool ones, AND override the
    ``get_session`` dependency so route handlers read/write the same DB the
    tests assert against.
    """
    application = create_app(test_settings)
    application.state.db_engine = engine
    application.state.sessionmaker = sessionmaker

    async def _override_get_session() -> AsyncIterator:
        async with sessionmaker() as session:
            yield session

    application.dependency_overrides[get_session] = _override_get_session
    return application


@pytest.fixture
async def client(app) -> AsyncIterator[AsyncClient]:
    """Async test client over ASGITransport with lifespan management."""
    async with LifespanManager(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
