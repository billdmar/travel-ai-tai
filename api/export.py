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

from cachetools import TTLCache

from api.models import Activity, ItineraryDay, ItineraryResponse, TravelPreferences

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
#
# The PDF is a *premium* artifact (not a text dump): a full-bleed cover, per-day
# spreads laid out as clean tables, a cost-summary page, and a server-rendered
# packing checklist. It is built with pure ``fpdf2`` (core fonts, drawn fills) —
# no remote images, no native deps — so it stays prod-safe on the slim image and
# self-contained (it never couples to the Unsplash image route). Section colors
# come from the app's Tailwind brand palette so the export matches the site.

# Brand palette (RGB), mirrored from web/tailwind.config — the ONE accent plus
# the warm-neutral ink/canvas scales. Kept here as a small literal table rather
# than parsed at runtime so the renderer has no config dependency.
_ACCENT_500 = (63, 122, 114)  # #3f7a72 — primary accent / section headers
_ACCENT_700 = (42, 80, 75)  # #2a504b — deep accent (cover ground)
_ACCENT_50 = (238, 244, 243)  # #eef4f3 — pale band fill / table head
_INK = (43, 42, 40)  # #2b2a28 — primary text
_INK_SOFT = (85, 82, 77)  # #55524d — secondary text
_INK_FAINT = (138, 133, 125)  # #8a857d — captions, footer
_INK_LINE = (231, 226, 217)  # #e7e2d9 — hairline borders / row rules
_CANVAS_SUNKEN = (241, 238, 231)  # #f1eee7 — zebra row fill
_WHITE = (255, 255, 255)

#: Rendered-PDF cache keyed by itinerary id. The PDF is comparatively expensive
#: to build and an itinerary's content is immutable once stored, so caching the
#: bytes for ~1h turns repeated downloads of the same trip into a dict lookup.
#: A new variant is a new id (and so a new key), so this never serves stale
#: content. ``maxsize`` caps memory; ``TTLCache`` evicts by age + insertion.
_PDF_CACHE: TTLCache[str, bytes] = TTLCache(maxsize=128, ttl=3600)

# Latin-1 is fpdf2's core-font encoding; replace anything outside it so the
# library never raises on an exotic glyph (e.g. an LLM-emitted emoji).
def _latin1(text: str) -> str:
    return text.encode("latin-1", "replace").decode("latin-1")


# Human-friendly labels for the budget tier so the cover reads naturally
# (``midrange`` -> ``Mid-range``). Mirrors the site's preference vocabulary.
_STYLE_LABELS = {"budget": "Budget", "midrange": "Mid-range", "luxury": "Luxury"}


def _rough_season(start: date) -> str | None:
    """Coarse, hemisphere-agnostic season from a trip's start month.

    Mirrors ``seasonFromDate`` in web/src/components/PackingChecklist.tsx so the
    server-rendered packing list matches what the user sees in the UI.
    """
    m = start.month
    if 3 <= m <= 5:
        return "spring"
    if 6 <= m <= 8:
        return "summer"
    if 9 <= m <= 11:
        return "autumn"
    return "winter"


def _packing_groups(itinerary: ItineraryResponse) -> list[tuple[str, list[str]]]:
    """Build the deterministic packing checklist server-side.

    A faithful Python port of ``buildChecklist`` in
    web/src/components/PackingChecklist.tsx: same essentials/clothing/health
    groups, the same season- and travel-style-driven additions, and the same
    activity-category-driven extras. Pure logic (no network, no randomness) so a
    given trip always yields the same list. Returned as ``(title, items)`` pairs
    preserving the UI's group order.
    """
    prefs: TravelPreferences = itinerary.preferences
    categories: set[str] = {
        activity.category for day in itinerary.days for activity in day.activities
    }

    essentials = [
        "Passport / ID and travel documents",
        "Phone, charger and a power bank",
        "Payment cards and a little local cash",
        "Reusable water bottle",
    ]
    if prefs.group_size > 1:
        essentials.append("Shared copies of bookings for the group")

    clothing = ["Comfortable walking shoes", "Day bag or small backpack"]
    season = _rough_season(prefs.start_date)
    if season == "summer":
        clothing += ["Light, breathable layers", "Sun hat and sunglasses"]
    elif season == "winter":
        clothing += ["Warm coat and thermal layers", "Gloves, hat and scarf"]
    elif season in ("spring", "autumn"):
        clothing.append("Light jacket and a packable rain layer")
    if prefs.travel_style == "luxury":
        clothing.append("A smart outfit for upscale dining or venues")

    health = ["Any personal medications", "Sunscreen", "Reusable mask / hand sanitiser"]
    for need in prefs.accessibility_needs:
        health.append(f"Accessibility: {need}")

    by_activity: list[str] = []
    if "attraction" in categories:
        by_activity.append("Camera and tickets / passes for attractions")
    if "leisure" in categories:
        by_activity.append("Swimwear and a quick-dry towel")
    if "food" in categories:
        by_activity.append("Reservation confirmations for dining")
    if "transport" in categories:
        by_activity.append("Transit passes and offline maps")
    if "accommodation" in categories:
        by_activity.append("Earplugs and a sleep mask")
    for diet in prefs.dietary_needs:
        by_activity.append(f"Dietary note to show: {diet}")

    groups = [
        ("Essentials", essentials),
        ("Clothing", clothing),
        ("Health & comfort", health),
    ]
    if by_activity:
        groups.append(("For your activities", by_activity))
    return groups


def _cost_by_category(itinerary: ItineraryResponse) -> list[tuple[str, float]]:
    """Sum activity costs per category, highest-spend first.

    Drives the cost-summary breakdown. Categories with no spend are omitted so
    the page only shows where money actually goes.
    """
    totals: dict[str, float] = {}
    for day in itinerary.days:
        for activity in day.activities:
            totals[activity.category] = (
                totals.get(activity.category, 0.0) + activity.estimated_cost_usd
            )
    return sorted(totals.items(), key=lambda kv: kv[1], reverse=True)


def render_pdf(itinerary: ItineraryResponse) -> bytes:
    """Render an :class:`ItineraryResponse` to a polished, multi-section PDF.

    Produces a premium artifact: a colored cover block (destination, dates,
    days, budget tier, pace, estimated total), one page per day with the day's
    activities as a clean time/title/cost/category table, a cost-summary page
    (grand total + per-category breakdown), and a server-rendered packing
    checklist — major sections separated by page breaks and headed with the
    brand-palette accent color.

    Lazily imports ``fpdf2``; raises :class:`PDFExportUnavailable` if it is not
    installed so the caller can degrade gracefully instead of 500-ing.
    """
    try:
        from fpdf import FPDF
    except ImportError as exc:  # pragma: no cover - exercised via route guard
        raise PDFExportUnavailable(
            "PDF export requires the 'fpdf2' package, which is not installed"
        ) from exc

    cache_key = str(itinerary.id)
    cached = _PDF_CACHE.get(cache_key)
    if cached is not None:
        return cached

    prefs = itinerary.preferences

    class _Doc(FPDF):
        """FPDF subclass with a quiet footer (page number + product mark).

        ``footer`` is called by fpdf2 on every page; ``self.page_no()`` is the
        page being rendered. The cover (page 1) is intentionally left clean.
        """

        def footer(self) -> None:  # noqa: D401 - fpdf2 hook name is fixed
            if self.page_no() == 1:
                return
            self.set_y(-12)
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(*_INK_FAINT)
            self.cell(0, 6, _latin1("Travel AI"), align="L")
            self.cell(0, 6, _latin1(f"Page {self.page_no()}"), align="R")

    pdf = _Doc()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_title(_latin1(f"{prefs.destination} itinerary"))

    _render_cover(pdf, itinerary)
    for day in itinerary.days:
        _render_day_page(pdf, day)
    _render_cost_page(pdf, itinerary)
    _render_packing_page(pdf, itinerary)

    # fpdf2 returns a bytearray from .output(); normalize to immutable bytes.
    out = bytes(pdf.output())
    _PDF_CACHE[cache_key] = out
    return out


def _section_header(pdf, title: str) -> None:
    """Draw a full-width accent band with the section title (left-aligned)."""
    epw = pdf.epw
    x, y = pdf.get_x(), pdf.get_y()
    pdf.set_fill_color(*_ACCENT_500)
    pdf.rect(x, y, epw, 11, style="F")
    pdf.set_xy(x + 3, y + 1)
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(*_WHITE)
    pdf.cell(epw - 6, 9, _latin1(title))
    pdf.set_xy(x, y + 11)
    pdf.ln(5)
    pdf.set_text_color(*_INK)


def _render_cover(pdf, itinerary: ItineraryResponse) -> None:
    """Render the full-bleed-ish cover page: deep accent ground + trip facts."""
    prefs = itinerary.preferences
    pdf.add_page()
    # Deep accent band across the top third of the cover.
    band_h = 95.0
    pdf.set_fill_color(*_ACCENT_700)
    pdf.rect(0, 0, pdf.w, band_h, style="F")

    pdf.set_xy(pdf.l_margin, 30)
    pdf.set_font("Helvetica", "I", 12)
    pdf.set_text_color(*_ACCENT_50)
    pdf.cell(0, 8, _latin1("Your itinerary"))

    pdf.set_xy(pdf.l_margin, 42)
    pdf.set_font("Helvetica", "B", 30)
    pdf.set_text_color(*_WHITE)
    pdf.multi_cell(pdf.epw, 13, _latin1(prefs.destination))

    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", "", 13)
    pdf.set_text_color(*_ACCENT_50)
    pdf.cell(
        0, 8, _latin1(_date_range(prefs.start_date, prefs.end_date))
    )

    # Fact strip below the band: days · budget tier · pace · group size.
    pdf.set_xy(pdf.l_margin, band_h + 14)
    facts = [
        ("Days", str(prefs.trip_length_days)),
        ("Budget", _STYLE_LABELS.get(prefs.travel_style, prefs.travel_style.title())),
        ("Pace", prefs.pace.title()),
        ("Travellers", str(prefs.group_size)),
    ]
    col_w = pdf.epw / len(facts)
    label_y = pdf.get_y()
    for i, (label, _value) in enumerate(facts):
        pdf.set_xy(pdf.l_margin + i * col_w, label_y)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*_INK_FAINT)
        pdf.cell(col_w, 5, _latin1(label.upper()))
    for i, (_label, value) in enumerate(facts):
        pdf.set_xy(pdf.l_margin + i * col_w, label_y + 5)
        pdf.set_font("Helvetica", "B", 15)
        pdf.set_text_color(*_INK)
        pdf.cell(col_w, 8, _latin1(value))

    # Summary paragraph.
    pdf.set_xy(pdf.l_margin, label_y + 22)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*_INK_SOFT)
    pdf.multi_cell(pdf.epw, 6, _latin1(itinerary.summary))
    pdf.ln(4)

    # Estimated-total chip.
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(*_ACCENT_700)
    pdf.cell(
        0,
        8,
        _latin1(
            f"Estimated total: "
            f"{_fmt_cost(itinerary.total_estimated_cost_usd)} {itinerary.currency}"
        ),
    )

    # FTC disclosure footer on the cover (every export carries it).
    pdf.set_xy(pdf.l_margin, pdf.h - 28)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(*_INK_FAINT)
    pdf.multi_cell(pdf.epw, 4, _latin1(FTC_DISCLOSURE))


def _render_day_page(pdf, day: ItineraryDay) -> None:
    """Render one day as its own page: a header band + an activities table."""
    pdf.add_page()
    _section_header(
        pdf, f"Day {day.day_number} - {day.date.isoformat()}"
    )
    pdf.set_font("Helvetica", "I", 12)
    pdf.set_text_color(*_INK_SOFT)
    pdf.multi_cell(pdf.epw, 6, _latin1(day.theme))
    pdf.ln(3)

    # Column layout for the time/title/cost/category table.
    epw = pdf.epw
    w_time = 18.0
    w_cost = 24.0
    w_cat = 30.0
    w_title = epw - w_time - w_cost - w_cat

    # Table head.
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(*_ACCENT_50)
    pdf.set_text_color(*_ACCENT_700)
    pdf.cell(w_time, 7, _latin1("TIME"), fill=True)
    pdf.cell(w_title, 7, _latin1("ACTIVITY"), fill=True)
    pdf.cell(w_cost, 7, _latin1("COST"), fill=True, align="R")
    pdf.cell(w_cat, 7, _latin1("CATEGORY"), fill=True)
    pdf.ln(7)

    for i, activity in enumerate(day.activities):
        zebra = i % 2 == 1
        # Pre-measure the wrapped title height so the whole row shares one height
        # and the row rule lands cleanly under the tallest cell.
        pdf.set_font("Helvetica", "B", 10)
        lines = pdf.multi_cell(
            w_title,
            5,
            _latin1(activity.place),
            dry_run=True,
            output="LINES",
        )
        row_h = max(9.0, 5.0 * max(1, len(lines)) + 4.0)

        x0, y0 = pdf.get_x(), pdf.get_y()
        if zebra:
            pdf.set_fill_color(*_CANVAS_SUNKEN)
            pdf.rect(x0, y0, epw, row_h, style="F")

        # Time.
        pdf.set_xy(x0, y0 + 2)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*_INK_SOFT)
        pdf.cell(w_time, 5, _latin1(activity.time))

        # Title (bold) + description (faint) in the title column.
        pdf.set_xy(x0 + w_time, y0 + 2)
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*_INK)
        pdf.multi_cell(w_title, 5, _latin1(activity.place))
        pdf.set_xy(x0 + w_time, pdf.get_y())
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*_INK_FAINT)
        pdf.multi_cell(w_title, 4, _latin1(activity.description))

        # Cost (right-aligned) + category, top-aligned with the row.
        pdf.set_xy(x0 + w_time + w_title, y0 + 2)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*_INK)
        pdf.cell(w_cost, 5, _latin1(_fmt_cost(activity.estimated_cost_usd)), align="R")
        pdf.set_xy(x0 + w_time + w_title + w_cost, y0 + 2)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*_INK_SOFT)
        pdf.cell(w_cat, 5, _latin1(activity.category))

        # Hairline rule under the row.
        pdf.set_xy(x0, y0 + row_h)
        pdf.set_draw_color(*_INK_LINE)
        pdf.line(x0, y0 + row_h, x0 + epw, y0 + row_h)
        pdf.set_xy(x0, y0 + row_h)


def _render_cost_page(pdf, itinerary: ItineraryResponse) -> None:
    """Render the cost-summary page: grand total + per-category breakdown."""
    pdf.add_page()
    _section_header(pdf, "Cost summary")

    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*_INK_SOFT)
    pdf.multi_cell(
        pdf.epw,
        6,
        _latin1(
            "Estimated costs for the planned activities. Transport, lodging and "
            "incidentals beyond the listed items are not included."
        ),
    )
    pdf.ln(2)

    epw = pdf.epw
    w_cat = epw * 0.6
    w_amt = epw - w_cat

    # Per-category rows.
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(*_ACCENT_50)
    pdf.set_text_color(*_ACCENT_700)
    pdf.cell(w_cat, 7, _latin1("CATEGORY"), fill=True)
    pdf.cell(w_amt, 7, _latin1("ESTIMATED"), fill=True, align="R")
    pdf.ln(7)

    for i, (category, amount) in enumerate(_cost_by_category(itinerary)):
        if i % 2 == 1:
            x0, y0 = pdf.get_x(), pdf.get_y()
            pdf.set_fill_color(*_CANVAS_SUNKEN)
            pdf.rect(x0, y0, epw, 7, style="F")
            pdf.set_xy(x0, y0)
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(*_INK)
        pdf.cell(w_cat, 7, _latin1(category.title()))
        pdf.cell(w_amt, 7, _latin1(_fmt_cost(amount)), align="R")
        pdf.ln(7)

    # Grand-total row mirrors ``total_estimated_cost_usd`` exactly.
    pdf.ln(1)
    pdf.set_draw_color(*_ACCENT_500)
    x0, y0 = pdf.get_x(), pdf.get_y()
    pdf.line(x0, y0, x0 + epw, y0)
    pdf.ln(1)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*_ACCENT_700)
    pdf.cell(w_cat, 9, _latin1("Grand total"))
    pdf.cell(
        w_amt,
        9,
        _latin1(
            f"{_fmt_cost(itinerary.total_estimated_cost_usd)} {itinerary.currency}"
        ),
        align="R",
    )
    pdf.ln(12)

    if itinerary.tips:
        _section_header(pdf, "Tips")
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(*_INK_SOFT)
        for tip in itinerary.tips:
            pdf.multi_cell(pdf.epw, 5, _latin1(f"- {tip}"))
            pdf.ln(1)


def _render_packing_page(pdf, itinerary: ItineraryResponse) -> None:
    """Render the server-built packing checklist as grouped, checkbox-style rows."""
    pdf.add_page()
    _section_header(pdf, "Packing checklist")
    pdf.set_font("Helvetica", "I", 11)
    pdf.set_text_color(*_INK_SOFT)
    pdf.multi_cell(pdf.epw, 6, _latin1("Tailored to your trip's season and activities."))
    pdf.ln(2)

    epw = pdf.epw
    for title, items in _packing_groups(itinerary):
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*_ACCENT_700)
        pdf.cell(0, 6, _latin1(title.upper()))
        pdf.ln(7)
        for item in items:
            x0, y0 = pdf.get_x(), pdf.get_y()
            # Empty checkbox square.
            pdf.set_draw_color(*_INK_LINE)
            pdf.rect(x0, y0 + 0.8, 3.6, 3.6, style="D")
            pdf.set_xy(x0 + 7, y0)
            pdf.set_font("Helvetica", "", 10)
            pdf.set_text_color(*_INK)
            pdf.multi_cell(epw - 7, 5, _latin1(item))
            pdf.set_x(x0)
        pdf.ln(3)


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
