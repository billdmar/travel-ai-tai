"""Itinerary export rendering (BE-EXPORT).

Renders a fully-assembled :class:`~api.models.ItineraryResponse` to two formats:

* **Markdown** — pure stdlib, always available. Clean, human-readable, includes
  destination / dates / per-day activities (time, place, cost, map + booking
  links) and an FTC affiliate-disclosure footer.
* **PDF** — uses ``fpdf2``, a light *pure-Python* library (no native/system
  deps, ships manylinux wheels) so it is prod-safe on the slim image. Mirroring
  the Gemini-SDK split, ``fpdf2`` is imported **lazily** inside
  :func:`render_pdf`; if it is not installed, :class:`PDFExportUnavailable` is
  raised so the route can return a clean 503 rather than crashing the app at
  import time. The Markdown path never imports it.
"""

from __future__ import annotations

from datetime import date

from api.models import Activity, ItineraryDay, ItineraryResponse

# Shown on every export so affiliate booking links carry the required FTC
# disclosure with the content itself (not just on the website).
FTC_DISCLOSURE = (
    "Disclosure: Some booking links in this itinerary are affiliate links. "
    "If you book through them we may earn a commission at no extra cost to you. "
    "This never influences which places are recommended."
)


class PDFExportUnavailable(RuntimeError):
    """Raised when PDF export is requested but ``fpdf2`` is not installed."""


def _fmt_cost(amount: float) -> str:
    """Format a USD cost with no cents noise (``$1,250``)."""
    return f"${amount:,.0f}"


def _date_range(start: date, end: date) -> str:
    """Render the trip's date span for headers."""
    if start == end:
        return start.isoformat()
    return f"{start.isoformat()} – {end.isoformat()}"


# ── Markdown ────────────────────────────────────────────────────────────────


def _activity_markdown(activity: Activity) -> list[str]:
    """Render one activity as markdown lines (a bullet plus link sub-lines)."""
    lines = [
        f"- **{activity.time}** — {activity.place} "
        f"({activity.category}, {_fmt_cost(activity.estimated_cost_usd)})",
        f"  - {activity.description}",
        f"  - [Map]({activity.map_url})",
    ]
    if activity.booking_url:
        lines.append(f"  - [Book]({activity.booking_url})")
    return lines


def _day_markdown(day: ItineraryDay) -> list[str]:
    """Render one itinerary day as a markdown section."""
    lines = [f"### Day {day.day_number} — {day.date.isoformat()}: {day.theme}", ""]
    for activity in day.activities:
        lines.extend(_activity_markdown(activity))
    lines.append("")
    return lines


def render_markdown(itinerary: ItineraryResponse) -> str:
    """Render an :class:`ItineraryResponse` to clean GitHub-flavored markdown."""
    prefs = itinerary.preferences
    lines: list[str] = [
        f"# {prefs.destination}",
        "",
        f"*{_date_range(prefs.start_date, prefs.end_date)} "
        f"· {prefs.trip_length_days} days "
        f"· {prefs.travel_style} · {prefs.pace} pace*",
        "",
        itinerary.summary,
        "",
        f"**Estimated total:** {_fmt_cost(itinerary.total_estimated_cost_usd)} "
        f"{itinerary.currency}",
        "",
    ]

    for day in itinerary.days:
        lines.extend(_day_markdown(day))

    if itinerary.tips:
        lines.append("## Tips")
        lines.append("")
        lines.extend(f"- {tip}" for tip in itinerary.tips)
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append(f"_{FTC_DISCLOSURE}_")
    lines.append("")

    return "\n".join(lines)


# ── PDF ─────────────────────────────────────────────────────────────────────

# Latin-1 is fpdf2's core-font encoding; replace anything outside it so the
# library never raises on an exotic glyph (e.g. an LLM-emitted emoji).
def _latin1(text: str) -> str:
    return text.encode("latin-1", "replace").decode("latin-1")


def render_pdf(itinerary: ItineraryResponse) -> bytes:
    """Render an :class:`ItineraryResponse` to a PDF byte string.

    Lazily imports ``fpdf2``; raises :class:`PDFExportUnavailable` if it is not
    installed so the caller can degrade gracefully instead of 500-ing.
    """
    try:
        from fpdf import FPDF
    except ImportError as exc:  # pragma: no cover - exercised via route guard
        raise PDFExportUnavailable(
            "PDF export requires the 'fpdf2' package, which is not installed"
        ) from exc

    prefs = itinerary.preferences
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    epw = pdf.epw  # effective page width (inside margins)

    pdf.set_font("Helvetica", "B", 20)
    pdf.multi_cell(epw, 10, _latin1(prefs.destination))

    pdf.set_font("Helvetica", "I", 11)
    pdf.multi_cell(
        epw,
        6,
        _latin1(
            f"{_date_range(prefs.start_date, prefs.end_date)} "
            f"| {prefs.trip_length_days} days "
            f"| {prefs.travel_style} | {prefs.pace} pace"
        ),
    )
    pdf.ln(2)

    pdf.set_font("Helvetica", "", 11)
    pdf.multi_cell(epw, 6, _latin1(itinerary.summary))
    pdf.ln(1)
    pdf.set_font("Helvetica", "B", 11)
    pdf.multi_cell(
        epw,
        6,
        _latin1(
            f"Estimated total: "
            f"{_fmt_cost(itinerary.total_estimated_cost_usd)} {itinerary.currency}"
        ),
    )
    pdf.ln(3)

    for day in itinerary.days:
        pdf.set_font("Helvetica", "B", 14)
        pdf.multi_cell(
            epw,
            8,
            _latin1(f"Day {day.day_number} - {day.date.isoformat()}: {day.theme}"),
        )
        for activity in day.activities:
            pdf.set_font("Helvetica", "B", 11)
            pdf.multi_cell(
                epw,
                6,
                _latin1(
                    f"{activity.time}  {activity.place}  "
                    f"({activity.category}, "
                    f"{_fmt_cost(activity.estimated_cost_usd)})"
                ),
            )
            pdf.set_font("Helvetica", "", 10)
            pdf.multi_cell(epw, 5, _latin1(activity.description))
            pdf.set_text_color(60, 90, 130)
            pdf.multi_cell(epw, 5, _latin1(f"Map: {activity.map_url}"))
            if activity.booking_url:
                pdf.multi_cell(epw, 5, _latin1(f"Book: {activity.booking_url}"))
            pdf.set_text_color(0, 0, 0)
            pdf.ln(1)
        pdf.ln(2)

    if itinerary.tips:
        pdf.set_font("Helvetica", "B", 14)
        pdf.multi_cell(epw, 8, "Tips")
        pdf.set_font("Helvetica", "", 10)
        for tip in itinerary.tips:
            pdf.multi_cell(epw, 5, _latin1(f"- {tip}"))
        pdf.ln(2)

    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(110, 110, 110)
    pdf.multi_cell(epw, 4, _latin1(FTC_DISCLOSURE))

    # fpdf2 returns a bytearray from .output(); normalize to immutable bytes.
    return bytes(pdf.output())
