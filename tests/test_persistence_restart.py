"""Persistence-survives-restart test (PLAN adversarial-review #2).

Uses a temp FILE-backed SQLite DB: write a record through one engine, dispose
it (simulating a process restart), reopen a fresh engine against the same file,
and confirm the record is still retrievable.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from api.cache import ItineraryCache
from api.config import Settings
from api.db import Base, ItineraryRecord, create_all
from api.llm.mock_provider import MockLLMProvider
from api.models import TravelPreferences
from api.recommend import RecommendationEngine, record_to_response


def _prefs() -> TravelPreferences:
    return TravelPreferences(
        destination="Tokyo, Japan",
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 3),
        budget_usd=1500.0,
    )


async def test_itinerary_survives_restart(tmp_path) -> None:
    db_file = tmp_path / "restart.db"
    url = f"sqlite+aiosqlite:///{db_file}"
    settings = Settings(LLM_PROVIDER="mock", OPENAI_API_KEY=None, DATABASE_URL=url)

    # ── First "process": create schema, generate + persist, then dispose. ──
    engine = create_async_engine(url, future=True)
    await create_all(engine)
    sm = async_sessionmaker(engine, expire_on_commit=False)
    rec_engine = RecommendationEngine(
        settings=settings, provider=MockLLMProvider(), cache=ItineraryCache(settings)
    )
    async with sm() as session:
        created = await rec_engine.generate(_prefs(), session)
    created_id = str(created.id)
    await engine.dispose()

    # ── Second "process": reopen the same file, read the record back. ──
    engine2 = create_async_engine(url, future=True)
    sm2 = async_sessionmaker(engine2, expire_on_commit=False)
    async with sm2() as session:
        record = await session.get(ItineraryRecord, created_id)
        assert record is not None
        rehydrated = record_to_response(record)
    await engine2.dispose()

    assert str(rehydrated.id) == created_id
    assert rehydrated.preferences.destination == "Tokyo, Japan"


def test_base_metadata_has_table() -> None:
    assert "itinerary_records" in Base.metadata.tables
