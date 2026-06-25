"""Pydantic v2 data models for Travel AI.

The schema is deliberately split into two layers (see PLAN adversarial-review #1):

* **LLM-facing** (`GeneratedItinerary`) — what the language model produces: the
  creative trip content only. It never invents server-owned identity fields.
* **Server-facing** (`ItineraryResponse`) — the full API response, assembled by
  the engine by attaching the server-owned ``id``, ``created_at``, the echoed
  request ``preferences``, ``provider``, and ``tokens_used`` onto the generated
  content.

Keeping these separate means the cache-hit "same id" guarantee comes from the
engine returning the stored record, not from the model emitting a stable id.
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

logger = logging.getLogger("tai.models")

# ── Bounds (also enforced at the API layer) ────────────────────────────────
MAX_DESTINATION_LEN = 200
MAX_TRIP_DAYS = 30
MAX_INTERESTS = 15

ActivityCategory = Literal[
    "food", "attraction", "transport", "accommodation", "leisure", "other"
]


class ErrorResponse(BaseModel):
    """The shared error envelope every failing endpoint returns.

    Mirrors the runtime shape the routes already emit — ``HTTPException`` with
    ``detail={"error": "<code>"}`` (FastAPI serializes that dict as the response
    body) and the app-level 422/429 handlers in :mod:`api.main` — so the
    generated OpenAPI schema documents the error contract instead of leaving
    failures as an opaque ``{}``.

    * ``error`` — a stable machine-readable code (e.g. ``itinerary_not_found``,
      ``llm_unavailable``, ``validation_failed``) the frontend branches on.
    * ``detail`` — a human-readable sentence; only the 422 handler sets it.
    * ``retry_after_seconds`` — only the 429 rate-limit handler sets it,
      mirroring the ``Retry-After`` header.

    This model is documentation/schema only: it is never used to *construct*
    responses, so it must not constrain the existing wire bodies — hence the
    optional fields default to ``None``.
    """

    error: str
    detail: str | None = None
    retry_after_seconds: int | None = None


class TravelPreferences(BaseModel):
    """Structured user input that drives itinerary generation."""

    destination: str = Field(..., max_length=MAX_DESTINATION_LEN, min_length=1)
    start_date: date
    end_date: date
    budget_usd: float = Field(..., gt=0)
    interests: list[str] = Field(default_factory=list, max_length=MAX_INTERESTS)
    pace: Literal["relaxed", "moderate", "packed"] = "moderate"
    travel_style: Literal["budget", "midrange", "luxury"] = "midrange"
    dietary_needs: list[str] = Field(default_factory=list)
    accessibility_needs: list[str] = Field(default_factory=list)
    group_size: int = Field(1, ge=1, le=20)
    notes: str | None = Field(None, max_length=2000)

    @model_validator(mode="after")
    def _check_dates(self) -> TravelPreferences:
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        trip_days = (self.end_date - self.start_date).days + 1
        if trip_days > MAX_TRIP_DAYS:
            raise ValueError(f"trip length must be 1-{MAX_TRIP_DAYS} days, got {trip_days}")
        return self

    @property
    def trip_length_days(self) -> int:
        return (self.end_date - self.start_date).days + 1


class Activity(BaseModel):
    """A single scheduled activity within a day."""

    time: str  # "09:00"
    place: str
    description: str
    estimated_cost_usd: float = Field(..., ge=0)
    category: ActivityCategory
    map_url: str
    #: Geographic coordinates for plotting the activity on the interactive map.
    #: Optional because the model only supplies them when it knows the place, and
    #: itineraries stored before this field existed have no coords — both must
    #: still validate, so each defaults to ``None``.
    lat: float | None = None
    lng: float | None = None
    #: Server-filled affiliate booking link (None until the engine attaches one).
    booking_url: str | None = None

    @model_validator(mode="after")
    def _drop_out_of_range_coords(self) -> Activity:
        """Discard a coordinate pair that falls outside valid Earth ranges.

        Today the mock provider emits sane coordinates, but the moment a real
        model (e.g. Gemini) starts supplying them it could hallucinate a value
        like ``lat=500``. Leaflet would silently plot such a pin in the wrong
        place — or off the map entirely — so a present-but-out-of-range pair is
        treated as *no coordinates*: we null **both** ``lat`` and ``lng`` (a
        half-valid pair is meaningless) and drop the pin rather than plot
        garbage. We never invent or clamp values here — the model stays
        decoupled from any provider's geocoding.
        """
        lat_ok = self.lat is None or -90.0 <= self.lat <= 90.0
        lng_ok = self.lng is None or -180.0 <= self.lng <= 180.0
        if not (lat_ok and lng_ok):
            logger.warning(
                "Dropping out-of-range activity coordinates for %r: lat=%s lng=%s",
                self.place,
                self.lat,
                self.lng,
            )
            self.lat = None
            self.lng = None
        return self


class ItineraryDay(BaseModel):
    """One day of the itinerary."""

    day_number: int = Field(..., ge=1)
    date: date
    theme: str
    activities: list[Activity]


class GeneratedItinerary(BaseModel):
    """The LLM-facing schema — creative trip content only.

    The model is asked to produce *exactly* this shape (the JSON schema is
    embedded in the system prompt). It must NOT include ``id``, ``created_at``,
    ``preferences``, ``provider``, or ``tokens_used`` — those are server-owned.
    """

    days: list[ItineraryDay]
    total_estimated_cost_usd: float = Field(..., ge=0)
    currency: str = "USD"
    summary: str
    tips: list[str]

    @field_validator("days")
    @classmethod
    def _non_empty(cls, v: list[ItineraryDay]) -> list[ItineraryDay]:
        if not v:
            raise ValueError("itinerary must contain at least one day")
        return v


class ItineraryResponse(BaseModel):
    """The full API response — generated content plus server-owned fields."""

    id: UUID
    created_at: datetime
    preferences: TravelPreferences
    days: list[ItineraryDay]
    total_estimated_cost_usd: float
    currency: str = "USD"
    summary: str
    tips: list[str]
    provider: Literal["openai", "mock", "langchain", "gemini"]
    tokens_used: int | None = None
    #: Whether the user has explicitly saved this itinerary (vs. a draft).
    saved: bool = False
    #: Set only when the selected provider silently degraded to the mock for
    #: this generation (e.g. Gemini quota exhausted). Transient per-request — it
    #: is never persisted, so a later cache hit returns ``None``. Lets the API
    #: surface the degrade (e.g. an ``X-LLM-Fallback`` header) instead of hiding
    #: it behind a log line.
    fallback_reason: str | None = None

    @classmethod
    def from_generated(
        cls,
        *,
        id: UUID,
        created_at: datetime,
        preferences: TravelPreferences,
        generated: GeneratedItinerary,
        provider: Literal["openai", "mock", "langchain", "gemini"],
        tokens_used: int | None,
        saved: bool = False,
        fallback_reason: str | None = None,
    ) -> ItineraryResponse:
        """Assemble the full response from LLM content + server-owned fields."""
        return cls(
            id=id,
            created_at=created_at,
            preferences=preferences,
            days=generated.days,
            total_estimated_cost_usd=generated.total_estimated_cost_usd,
            currency=generated.currency,
            summary=generated.summary,
            tips=generated.tips,
            provider=provider,
            tokens_used=tokens_used,
            saved=saved,
            fallback_reason=fallback_reason,
        )


class ItineraryListItem(BaseModel):
    """Compact representation for the paginated list endpoint."""

    id: UUID
    created_at: datetime
    destination: str
    start_date: date
    end_date: date
    total_estimated_cost_usd: float


class ItineraryListResponse(BaseModel):
    """Paginated list envelope."""

    page: int
    per_page: int
    total: int
    items: list[ItineraryListItem]


# ── Discovery: hobby-driven destination recommendations ─────────────────────
# The discovery flow keeps the same two-layer split as itineraries: the model
# produces the creative ``DestinationRecommendation`` content, and the API
# returns it inside the ``DestinationRecommendationResponse`` envelope.

#: Discovery accepts 1-N hobbies; cap mirrors ``MAX_INTERESTS`` on preferences.
MAX_HOBBIES = MAX_INTERESTS


class HobbyRecommendationRequest(BaseModel):
    """User input for the discovery flow: hobbies plus optional free text."""

    hobbies: list[str] = Field(default_factory=list, max_length=MAX_HOBBIES)
    free_text: str | None = Field(None, max_length=2000)


class DestinationRecommendation(BaseModel):
    """One recommended destination matched to the user's hobbies.

    LLM-facing creative content only — the model is asked to emit exactly this
    shape (the JSON schema is embedded in the discovery system prompt).
    """

    name: str
    country: str
    why_it_fits: str
    tags: list[str]
    image_query: str
    best_season: str


class DestinationRecommendationResponse(BaseModel):
    """Discovery response envelope wrapping the recommended destinations."""

    recommendations: list[DestinationRecommendation]

    @field_validator("recommendations")
    @classmethod
    def _non_empty(
        cls, v: list[DestinationRecommendation]
    ) -> list[DestinationRecommendation]:
        if not v:
            raise ValueError("must contain at least one recommendation")
        return v
