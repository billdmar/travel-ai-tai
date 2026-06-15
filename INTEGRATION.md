# Integration Note — `feat/redesign-fe-itinerary`

**For:** Terminal 1 (owns `App.tsx` + routing; performs the merge into the main redesign).
**From:** Terminal 2 — Frontend Itinerary + Content pages.

## 1. What this branch contains

Restyled itinerary rendering + 4 new content/route pages, plus an affiliate-link layer (FTC disclosure banner and per-activity "Book" links). **Exactly 7 files** were created or changed — nothing else.

| File | Status | Purpose |
|---|---|---|
| `web/src/components/ItineraryView.tsx` | restyled | Itinerary renderer; added FTC affiliate-disclosure banner; wraps content in `Reveal`. |
| `web/src/components/DayCard.tsx` | restyled | Per-day card; added affiliate **Book** link (gated on `Activity.booking_url`) beside existing **Map** link + pricing. |
| `web/src/pages/ItineraryPage.tsx` | **NEW** | Route page for `/itinerary/:id` (fetch + render one itinerary). |
| `web/src/pages/SavedItinerariesPage.tsx` | restyled | Saved list; list/pagination/delete logic preserved. |
| `web/src/pages/HowItWorksPage.tsx` | **NEW** | Static content page for `/how-it-works`. |
| `web/src/pages/AboutPage.tsx` | **NEW** | Static content page for `/about`. |
| `web/src/pages/DisclosurePage.tsx` | **NEW** | Static affiliate-disclosure page for `/disclosure`. |

## 2. Routes to register in `App.tsx`

Terminal 1 owns routing. Register these:

| Route | Component | Source |
|---|---|---|
| `/itinerary/:id` | `ItineraryPage` | `pages/ItineraryPage.tsx` (default export) |
| `/how-it-works` | `HowItWorksPage` | `pages/HowItWorksPage.tsx` (default export) |
| `/about` | `AboutPage` | `pages/AboutPage.tsx` (default export) |
| `/disclosure` | `DisclosurePage` | `pages/DisclosurePage.tsx` (default export) |
| `/saved` | `SavedItinerariesPage` | `pages/SavedItinerariesPage.tsx` (restyled — already existed; **confirm it's still wired**) |

- **`/discover` must exist.** Several of these pages navigate/link to `/discover` (the home/plan route) — verified in `ItineraryPage` (`navigate('/discover')`), `SavedItinerariesPage` (fallback), `AboutPage` and `HowItWorksPage` (`<Link to="/discover">`). Ensure Terminal 1 registers `/discover`. `ItineraryPage` also routes to `/saved`; `ItineraryView` links to `/disclosure`.

## 3. Frozen interfaces relied upon

These must exist after merge or this branch won't typecheck/build:

- **`'../components/ui'` barrel** exporting `Container`, `Section`, `Reveal`. Only these three are used. `Reveal` is used **with children only** — no extra props (no `delay`/`stagger`).
- **`'react-router-dom'`**: `Link`, `useNavigate`, `useParams`.
- **`'framer-motion'`**: used **transitively via `Reveal`** — not imported directly in any of these 7 files.
- **`web/src/types/itinerary.ts`**: `Activity` must gain **`booking_url?: string`**. `DayCard` reads `activity.booking_url` to gate the Book link. *(On this branch the field is not yet on the `Activity` interface — it lands with Terminal 1's type changes.)*
- **`api/client.ts`**: `getItinerary(id)`, `saveItinerary(id)`, `listItineraries(page, perPage)`, `deleteItinerary(id)` — all present on this branch's `client.ts`. Confirm they survive the merge.

## 4. Reconciliation points / decisions for Terminal 1

Flagging these rather than silently assuming:

- **Saved → View is in-page, not a deep link.** `SavedItinerariesPage` keeps the original behavior: the `view()` handler fetches the itinerary and renders `ItineraryView` **inline**, rather than navigating to `/itinerary/:id`. If you prefer View to deep-link, it's a small swap inside `view()`.
- **Legacy `onNavigateHome?` prop.** `SavedItinerariesPage` still accepts `onNavigateHome?: () => void`; when absent it falls back to router `navigate('/discover')`. Safe whether or not Terminal 1 passes the prop.
- **`Reveal` has no stagger/delay.** The documented `Reveal` interface didn't specify one, so day-card/list entrances aren't sequenced. If the real `Reveal` supports `delay`/`stagger`, sequencing entrances later is purely additive — not required for merge.

## 5. Build / verification status

**Honest status:** a full `npm run build` / typecheck could **not** be run in isolation on this branch. The frozen interfaces it depends on — the `components/ui` barrel, `react-router-dom`, `framer-motion`, and the `Activity.booking_url` field — live on Terminal 1's branch and resolve **only after merge**. (Confirmed on this branch: `components/ui` does not yet exist and `Activity.booking_url` is not yet declared, so a standalone typecheck would fail on unresolved imports — expected.)

Imports, exports, navigate/link targets, and internal consistency across the 7 files were **verified by hand**. **Terminal 1 should run the typecheck/build after merge** to confirm the combined result.
