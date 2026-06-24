"""Thin streaming adapter over the recommendation engine.

The frozen frontend contract (``web/src/api/client.ts::streamItinerary``) reads
an SSE ``text/event-stream`` where each ``data:`` line is delivered to a
callback and the **last** ``data:`` line carries the full ``ItineraryResponse``
JSON. The whole pipeline (validation, server-owned normalization, persistence,
caching) already lives in :meth:`RecommendationEngine.generate`; rather than
re-implement any of it — or rewrite the provider files to expose native token
streaming — this adapter simply *generates* the itinerary through the engine
and then re-emits it as a sequence of human-readable progress chunks so the UI
always looks live, regardless of provider.

This is deliberately a "mock-stream" of an already-generated result: it works
identically for the mock provider, a real Gemini/OpenAI completion, and the
Gemini quota-exhausted fallback (which the engine resolves to mock under the
hood). Honest note: this does NOT stream real model tokens as they are produced
— the underlying providers are request/response, not streaming — it streams the
finished itinerary in chunks. The terminal event is the source of truth.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import TYPE_CHECKING

from api.models import ItineraryResponse, TravelPreferences

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from api.recommend import RecommendationEngine


def progress_chunks(itinerary: ItineraryResponse) -> list[str]:
    """Build the ordered list of human-readable progress chunks for an itinerary.

    These are the intermediate ``data:`` payloads the UI shows while the trip
    "streams in": a header line, then one line per day naming its theme and
    activity count, then the summary. They are plain text (not JSON) so the
    frontend's ``onChunk`` can render them directly; the terminal JSON event is
    emitted separately by :func:`stream_itinerary`.
    """
    prefs = itinerary.preferences
    chunks: list[str] = [
        f"Planning your {len(itinerary.days)}-day trip to {prefs.destination}...",
    ]
    for day in itinerary.days:
        chunks.append(
            f"Day {day.day_number}: {day.theme} "
            f"({len(day.activities)} activities)"
        )
    chunks.append(itinerary.summary)
    return chunks


async def stream_itinerary(
    engine: RecommendationEngine,
    prefs: TravelPreferences,
    session: AsyncSession,
) -> AsyncIterator[ItineraryResponse | str]:
    """Yield progress chunks, then the final :class:`ItineraryResponse`.

    Generates the itinerary via the engine (so caching, normalization, and
    persistence all happen exactly once and identically to the non-streaming
    path), then yields each progress string in order, and finally yields the
    full ``ItineraryResponse`` object as the terminal item. The route layer is
    responsible for SSE-encoding each yielded value.
    """
    itinerary = await engine.generate(prefs, session)
    for chunk in progress_chunks(itinerary):
        yield chunk
    yield itinerary
