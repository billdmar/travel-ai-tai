"""Server-owned affiliate booking links for itinerary activities.

Like :func:`api.llm.prompts.itinerary.maps_url`, the server owns these links so
they always resolve to a working *search* page rather than an LLM-hallucinated
deep link. Each activity category maps to the most relevant partner:

* ``attraction`` / ``leisure`` → Viator (or GetYourGuide) tours & tickets,
* ``accommodation`` → Booking.com stays,
* ``transport`` → a flights/transport search.

The matching affiliate-tag slot from :class:`~api.config.Settings` is appended
as the partner's tracking parameter. When the slot is empty (the default,
placeholder state) we return a CLEAN plain deep link with NO fake tracking
params — so the link works and earns nothing until a real tag is configured.
``food`` and ``other`` have no sensible booking partner and return ``None``.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from urllib.parse import quote_plus

if TYPE_CHECKING:
    from api.config import Settings


def _search_query(place: str, destination: str) -> str:
    """Return ``"place, destination"`` (skipping the doubling maps_url avoids)."""
    place = place.strip()
    destination = destination.strip()
    if destination and destination.lower() not in place.lower():
        return f"{place}, {destination}"
    return place


def booking_url(
    category: str,
    place: str,
    destination: str,
    settings: Settings,
) -> str | None:
    """Return an affiliate (or plain) booking-search URL for an activity.

    Maps the activity ``category`` to a partner search page for ``place`` within
    ``destination`` and appends the partner's affiliate-tag slot from
    ``settings``. An empty slot yields a clean link with no tracking params.
    Categories with no booking partner (``food``, ``other``) return ``None``.
    """
    query = quote_plus(_search_query(place, destination))

    if category in ("attraction", "leisure"):
        tag = settings.affiliate_tag_viator.strip()
        base = f"https://www.viator.com/searchResults/all?text={query}"
        # Viator's affiliate program uses a `pid` partner id.
        return f"{base}&pid={quote_plus(tag)}" if tag else base

    if category == "accommodation":
        tag = settings.affiliate_tag_booking.strip()
        base = f"https://www.booking.com/searchresults.html?ss={query}"
        # Booking.com attributes referrals via the `aid` affiliate id.
        return f"{base}&aid={quote_plus(tag)}" if tag else base

    if category == "transport":
        tag = settings.affiliate_tag_flights.strip()
        base = f"https://www.kayak.com/flights?search={query}"
        return f"{base}&affiliate={quote_plus(tag)}" if tag else base

    return None
