"""The recommendation engine: preferences → persisted itinerary.

``RecommendationEngine.generate`` is the heart of the data flow. It derives a
deterministic cache key from the preferences, returns the previously stored
record on a cache hit (giving the "same id" guarantee), and on a miss calls the
LLM provider, validates the output against the frozen ``GeneratedItinerary``
schema, assembles the full ``ItineraryResponse`` with server-owned fields,
persists it, and caches the fingerprint → id mapping.

Provider/parse failures surface as :class:`LLMUnavailableError` and
:class:`ItineraryParseError`, which the API layer maps to ``503`` and ``502``.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from pydantic import ValidationError

from api import affiliate
from api.config import Settings, get_settings
from api.db import ItineraryRecord
from api.llm.prompts.itinerary import build_system_prompt, build_user_prompt, maps_url
from api.models import (
    GeneratedItinerary,
    ItineraryListItem,
    ItineraryResponse,
    TravelPreferences,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from api.cache import ItineraryCache
    from api.llm.provider import LLMProvider

logger = logging.getLogger("tai.recommend")

_RAW_LOG_LIMIT = 500


class LLMUnavailableError(RuntimeError):
    """Raised when the LLM provider is unreachable after retries."""


class ItineraryParseError(RuntimeError):
    """Raised when the LLM returns JSON that fails schema validation."""


def cache_key_for(prefs: TravelPreferences) -> str:
    """Return the SHA-256 fingerprint of the canonical preference JSON."""
    canonical = json.dumps(
        prefs.model_dump(mode="json"), sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def normalize_generated(
    generated: GeneratedItinerary,
    prefs: TravelPreferences,
    settings: Settings | None = None,
) -> GeneratedItinerary:
    """Return a corrected copy of ``generated`` with server-owned values fixed.

    The LLM is unreliable about three things the UI depends on, so the server
    enforces them deterministically instead of trusting the model:

    * **Grand total** — ``total_estimated_cost_usd`` is recomputed as the exact
      sum of every activity's ``estimated_cost_usd`` across all days (rounded to
      2 dp). Per-activity costs are the model's own estimates and are left
      untouched; only the grand total is derived from them so the displayed
      numbers always reconcile.
    * **Map links** — every activity's ``map_url`` is overwritten with a
      canonical :func:`~api.llm.prompts.itinerary.maps_url` search link so the
      links always resolve (LLM-supplied URLs hallucinate and 404).
    * **Booking links** — every activity's ``booking_url`` is set from
      :func:`api.affiliate.booking_url` (``None`` for categories with no
      partner), again server-owned so the links resolve and carry our tag.

    ``settings`` defaults to the process settings (so callers like
    ``record_to_response`` need not thread it through); the engine passes its
    own. Returns a new immutable instance via ``model_copy``.
    """
    settings = settings or get_settings()
    total = 0.0
    new_days = []
    for day in generated.days:
        new_activities = []
        for activity in day.activities:
            total += activity.estimated_cost_usd
            new_activities.append(
                activity.model_copy(
                    update={
                        "map_url": maps_url(activity.place, prefs.destination),
                        "booking_url": affiliate.booking_url(
                            activity.category,
                            activity.place,
                            prefs.destination,
                            settings,
                        ),
                    }
                )
            )
        new_days.append(day.model_copy(update={"activities": new_activities}))

    return generated.model_copy(
        update={
            "days": new_days,
            "total_estimated_cost_usd": round(total, 2),
        }
    )


class RecommendationEngine:
    """Translates preferences into a validated, persisted itinerary."""

    def __init__(
        self,
        *,
        settings: Settings,
        provider: LLMProvider,
        cache: ItineraryCache,
    ) -> None:
        self._settings = settings
        self._provider = provider
        self._cache = cache

    async def generate(
        self, prefs: TravelPreferences, session: AsyncSession
    ) -> ItineraryResponse:
        """Generate (or return a cached) itinerary for ``prefs``."""
        key = cache_key_for(prefs)

        cached = await self._cache_hit(key, session)
        if cached is not None:
            logger.debug("cache hit key=%s id=%s", key[:8], cached.id)
            return cached

        result = await self._provider.complete(
            system=build_system_prompt(),
            user=build_user_prompt(prefs),
            max_tokens=self._settings.max_tokens,
        )
        raw = result.text

        try:
            generated = GeneratedItinerary.model_validate_json(raw)
        except ValidationError as exc:
            logger.warning(
                "itinerary_parse_failed raw=%r", raw[:_RAW_LOG_LIMIT]
            )
            raise ItineraryParseError("LLM output failed schema validation") from exc

        # Server-enforce the grand total, canonical map links, and booking links
        # before assembly.
        generated = normalize_generated(generated, prefs, self._settings)

        itinerary_id = uuid4()
        # Trust the provider-reported usage; a provider that reports nothing
        # (the mock, or a real response without usage metadata) records 0 to
        # distinguish "no usage reported" from a real count.
        tokens_used = result.tokens_used if result.tokens_used is not None else 0

        # ``created_at`` is owned by the database (server_default=now()), so we
        # persist first and read the DB-assigned timestamp back off the row when
        # assembling the response — keeping the one authoritative value rather
        # than a separately-computed client clock.
        record = await self._persist(
            itinerary_id=itinerary_id,
            prefs=prefs,
            generated=generated,
            tokens_used=tokens_used,
            session=session,
        )

        response = ItineraryResponse.from_generated(
            id=itinerary_id,
            created_at=record.created_at,
            preferences=prefs,
            generated=generated,
            provider=self._provider.name,
            tokens_used=tokens_used,
            saved=False,  # fresh generation is a draft until explicitly saved
            fallback_reason=result.fallback_reason,
        )

        await self._cache.set(key, str(itinerary_id))
        logger.info(
            "itinerary generated id=%s provider=%s key=%s",
            itinerary_id,
            self._provider.name,
            key[:8],
        )
        return response

    async def _cache_hit(
        self, key: str, session: AsyncSession
    ) -> ItineraryResponse | None:
        """Return the stored itinerary for ``key`` if present and live."""
        cached_id = await self._cache.get(key)
        if cached_id is None:
            return None
        record = await session.get(ItineraryRecord, cached_id)
        if record is None or record.deleted_at is not None:
            return None
        return record_to_response(record)

    async def _persist(
        self,
        *,
        itinerary_id: UUID,
        prefs: TravelPreferences,
        generated: GeneratedItinerary,
        tokens_used: int | None,
        session: AsyncSession,
    ) -> ItineraryRecord:
        """Insert the itinerary as a new row and return it with ``created_at``.

        ``created_at`` is left unset so the database server_default (``now()``)
        supplies it; we ``refresh`` the row after commit to load that
        DB-assigned, timezone-aware timestamp back onto the instance for the
        caller to surface in the response.
        """
        record = ItineraryRecord(
            id=str(itinerary_id),
            preferences_json=prefs.model_dump_json(),
            itinerary_json=generated.model_dump_json(),
            provider=self._provider.name,
            tokens_used=tokens_used,
        )
        session.add(record)
        await session.commit()
        await session.refresh(record)
        return record


def record_to_list_item(record: ItineraryRecord) -> ItineraryListItem:
    """Project a stored row onto the compact list-endpoint shape.

    Parses only what the list needs (destination, dates, cost total) — avoids
    the full normalize_generated path and its per-activity link rewriting.
    """
    preferences = TravelPreferences.model_validate_json(record.preferences_json)
    generated = GeneratedItinerary.model_validate_json(record.itinerary_json)
    total = sum(
        activity.estimated_cost_usd
        for day in generated.days
        for activity in day.activities
    )
    return ItineraryListItem(
        id=UUID(record.id),
        created_at=record.created_at,
        destination=preferences.destination,
        start_date=preferences.start_date,
        end_date=preferences.end_date,
        total_estimated_cost_usd=round(total, 2),
    )


def record_to_response(record: ItineraryRecord) -> ItineraryResponse:
    """Rehydrate a full ``ItineraryResponse`` from a stored ORM row."""
    preferences = TravelPreferences.model_validate_json(record.preferences_json)
    generated = GeneratedItinerary.model_validate_json(record.itinerary_json)
    # Re-apply normalization on read so historical rows (persisted before the
    # server owned totals/map links) also reconcile and yield working links.
    generated = normalize_generated(generated, preferences)
    return ItineraryResponse.from_generated(
        id=UUID(record.id),
        created_at=record.created_at,
        preferences=preferences,
        generated=generated,
        provider=record.provider,  # type: ignore[arg-type]
        tokens_used=record.tokens_used,
        saved=record.saved_at is not None,
    )
