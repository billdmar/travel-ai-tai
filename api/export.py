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
* **ICS** — an RFC 5545 VCALENDAR with one VEVENT per activity, hand-rolled
  from stdlib only (no calendar library) so it is always available. Each event
  is anchored to its day's date; since activities carry a wall-clock time but no
  timezone, events are emitted as date-based (all-day, ``VALUE=DATE``) so they
  land on the correct day in any calendar without a TZID guess.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

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


# ── ICS (RFC 5545) ───────────────────────────────────────────────────────────

# Calendar tools split on CRLF (the spec-mandated line terminator) and unfold
# any line that begins with whitespace into the previous one.
_CRLF = "\r\n"
#: Stable namespace for per-event UIDs so re-exporting the same trip yields the
#: same UIDs (calendars dedupe / update on UID rather than duplicating events).
_UID_DOMAIN = "travel-ai.tai"


def _escape_ics(text: str) -> str:
    """Escape a value for an ICS TEXT field per RFC 5545 §3.3.11.

    Backslash, comma, and semicolon are escaped, and any newline becomes the
    literal two-character sequence ``\\n``. Order matters: the backslash is
    escaped first so the escapes we add are not themselves re-escaped.
    """
    return (
        text.replace("\\", "\\\\")
        .replace(",", "\\,")
        .replace(";", "\\;")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace("\r", "\\n")
    )


def _fold_line(line: str) -> str:
    """Fold a content line to <=75 octets per RFC 5545 §3.1.

    Continuation lines are prefixed with a single space; folding is done on a
    byte boundary (UTF-8) so a multi-byte character is never split across lines.
    """
    encoded = line.encode("utf-8")
    if len(encoded) <= 75:
        return line
    chunks: list[bytes] = []
    # First line gets 75 octets; each continuation reserves 1 octet for the
    # leading space, so 74 octets of payload.
    chunks.append(encoded[:75])
    rest = encoded[75:]
    while rest:
        chunks.append(rest[:74])
        rest = rest[74:]
    # Decode each chunk on its byte boundary. ``errors="ignore"`` would drop a
    # split code point, but we only ever cut on a 75/74-octet boundary that may
    # land mid-character, so glue back any trailing partial bytes to the next
    # chunk instead of slicing blindly.
    return _decode_chunks(chunks)


def _decode_chunks(chunks: list[bytes]) -> str:
    """Decode UTF-8 byte chunks, repairing splits across chunk boundaries."""
    out: list[str] = []
    carry = b""
    for i, chunk in enumerate(chunks):
        data = carry + chunk
        # Trim trailing bytes that form an incomplete UTF-8 sequence and carry
        # them to the next chunk so we never decode a partial code point.
        while data:
            try:
                text = data.decode("utf-8")
                carry = b""
                break
            except UnicodeDecodeError:
                carry = data[-1:] + carry
                data = data[:-1]
        else:
            text = ""
        # Only emit a line when there is decoded text to carry. A continuation
        # chunk can trim to empty after deferring its bytes as an incomplete
        # UTF-8 sequence; appending it anyway would yield a space-only line
        # (``" "``) that violates RFC 5545 §3.1 line folding. The first line is
        # always preserved even when empty so a degenerate value still folds to
        # a well-formed (empty) content line.
        if text or i == 0:
            out.append(("" if i == 0 else " ") + text)
    return _CRLF.join(out)


def _ics_dtstamp(value: datetime) -> str:
    """Format a UTC timestamp as an RFC 5545 DATE-TIME (``20260701T000000Z``)."""
    return value.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _ics_date(value: date) -> str:
    """Format a calendar date as an RFC 5545 DATE (``20260701``)."""
    return value.strftime("%Y%m%d")


def _activity_vevent(
    activity: Activity,
    day: ItineraryDay,
    index: int,
    destination: str,
    dtstamp: str,
) -> list[str]:
    """Render one activity as the content lines of a VEVENT.

    The event is date-based (all-day): DTSTART is the day's date and DTEND is
    the next day, the inclusive→exclusive convention RFC 5545 requires for
    ``VALUE=DATE`` events. The activity's wall-clock ``time`` is preserved in
    the SUMMARY so the schedule is still legible inside the day.
    """
    uid = f"{day.date.isoformat()}-{day.day_number}-{index}@{_UID_DOMAIN}"
    summary = f"{activity.time} {activity.place}"
    description_parts = [activity.description]
    if activity.booking_url:
        description_parts.append(f"Book: {activity.booking_url}")
    description_parts.append(f"Map: {activity.map_url}")
    description = "\n".join(description_parts)

    return [
        "BEGIN:VEVENT",
        f"UID:{_escape_ics(uid)}",
        f"DTSTAMP:{dtstamp}",
        f"DTSTART;VALUE=DATE:{_ics_date(day.date)}",
        f"DTEND;VALUE=DATE:{_ics_date(date.fromordinal(day.date.toordinal() + 1))}",
        f"SUMMARY:{_escape_ics(summary)}",
        f"DESCRIPTION:{_escape_ics(description)}",
        f"LOCATION:{_escape_ics(f'{activity.place}, {destination}')}",
        f"CATEGORIES:{_escape_ics(activity.category)}",
        "END:VEVENT",
    ]


def render_ics(itinerary: ItineraryResponse) -> str:
    """Render an :class:`ItineraryResponse` to an RFC 5545 VCALENDAR string.

    Emits one VEVENT per activity (date-based all-day events anchored to each
    day), with a stable per-event UID, DTSTAMP, SUMMARY, DESCRIPTION, LOCATION,
    and CATEGORIES. Output uses CRLF line endings and 75-octet line folding so
    it imports cleanly into Apple Calendar / Google Calendar / Outlook.

    Pure stdlib — no calendar dependency — so it is always available (unlike the
    optional PDF path).
    """
    destination = itinerary.preferences.destination
    # A single DTSTAMP (export time) for every event is valid and keeps a
    # re-export byte-stable except for this field.
    dtstamp = _ics_dtstamp(datetime.now(tz=timezone.utc))

    lines: list[str] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:-//{_UID_DOMAIN}//Travel AI//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_escape_ics(destination)}",
    ]
    for day in itinerary.days:
        for index, activity in enumerate(day.activities):
            lines.extend(
                _activity_vevent(activity, day, index, destination, dtstamp)
            )
    lines.append("END:VCALENDAR")

    # Fold every content line, then join with CRLF and terminate with a final
    # CRLF (RFC 5545 requires each line, including the last, to end in CRLF).
    return _CRLF.join(_fold_line(line) for line in lines) + _CRLF
