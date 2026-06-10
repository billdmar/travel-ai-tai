# Travel AI (TAI) — UX/UI Design Spec

Implementation-ready spec for an elevation pass on the existing React + Vite + TS + Tailwind UI.
Palette in `tailwind.config.js`: `brand-{50,100,200,500,600,700}` (blue) + slate. Recommend
adding two tokens (see §6) but the spec works without them. **No new dependencies.**

---

## 1. Save UX (new feature)

`ItineraryResponse` now carries `saved: boolean`. Add to `types/itinerary.ts`:
```ts
saved: boolean
```
Add to `api/client.ts`:
```ts
export function saveItinerary(id: string): Promise<ItineraryResponse> {
  return request(`${BASE}/itineraries/${encodeURIComponent(id)}/save`, { method: 'POST' })
}
```

### Placement
The Save control lives in the **summary card** of `ItineraryView.tsx` (the gradient header), as a
solid white pill in the top-right action row, paired with the "Est. total" block. It must be the
most prominent action on the screen after generation. The existing "Plan another trip" button stays
at the bottom (secondary).

Lift save state into `ItineraryView` so it owns it:
```tsx
type SaveState = 'idle' | 'saving' | 'saved'
const [saveState, setSaveState] = useState<SaveState>(itinerary.saved ? 'saved' : 'idle')
```

### Three visual states (button is the same element, label/style swaps)
Place inside the summary card header, before/above the Est. total block (`flex flex-col items-end gap-2`).

**Unsaved (idle)** — high-contrast white-on-gradient, clearly primary:
```tsx
<button
  onClick={onSave}
  className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold
             text-brand-700 shadow-sm transition hover:bg-brand-50
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-600">
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5z" />
  </svg>
  Save itinerary
</button>
```

**Saving…** — disabled, spinner, `aria-busy`:
```tsx
<button disabled aria-busy="true"
  className="inline-flex items-center gap-2 rounded-lg bg-white/80 px-4 py-2 text-sm font-semibold text-brand-700 cursor-wait">
  <svg aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" .../> Saving…
</button>
```

**Saved ✓** — disabled, green, unmistakable, checkmark icon:
```tsx
<button disabled aria-label="Itinerary saved"
  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white cursor-default">
  <svg aria-hidden="true" className="h-4 w-4" ...><path d="M5 13l4 4L19 7" .../></svg>
  Saved
</button>
```

### Confirmation toast (inline, no deps)
On transition to `saved`, render a fixed, auto-dismissing toast (5s `setTimeout`), with the
"View in Saved" deep link. Use `role="status"` + `aria-live="polite"` so it announces.
```tsx
{showToast && (
  <div role="status" aria-live="polite"
       className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl
                  border border-emerald-200 bg-white px-4 py-3 shadow-lg
                  motion-safe:animate-[fadeIn_200ms_ease-out]">
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white text-xs">✓</span>
    <span className="text-sm font-medium text-slate-800">Saved to your itineraries.</span>
    <button onClick={onViewSaved}
            className="text-sm font-semibold text-brand-600 hover:text-brand-700 hover:underline
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
      View in Saved →
    </button>
  </div>
)}
```

### "View in Saved" wiring
`App.tsx` already holds page state but renders `HomePage`/`SavedPage` without props. Pass a
navigation callback down so the toast/link can switch pages:
```tsx
// App.tsx
<HomePage onNavigateSaved={() => setPage('saved')} />
// HomePage forwards it to ItineraryView as onViewSaved
```
In the saved-list path (`SavedItinerariesPage` → `ItineraryView`), `itinerary.saved` is already
true, so the button renders in the **Saved** state and no toast fires.

### Disabled / already-saved
- `saving` and `saved` states set `disabled`. Re-clicking is impossible.
- Guard the handler: `if (saveState !== 'idle') return`.
- On API error during save, revert to `idle` and surface via existing `ErrorBanner` (add an
  `onError` callback or reuse HomePage's error state). Do not silently swallow.

---

## 2. Map affordance (DayCard table)

Current: bare `Map ↗` text link, no `aria-label`, tiny tap target. Make it an icon+label pill
with an accessible name that includes the place.

**Before**
```tsx
<a href={a.map_url} target="_blank" rel="noopener noreferrer"
   className="font-medium text-brand-600 hover:text-brand-700 hover:underline">Map ↗</a>
```
**After**
```tsx
<a href={a.map_url} target="_blank" rel="noopener noreferrer"
   aria-label={`Open ${a.place} in Google Maps (opens in new tab)`}
   className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs
              font-medium text-brand-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
  <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
  <span>Map</span>
</a>
```
Since map links now always resolve, no need for a fallback/empty state — but if `map_url` is ever
falsy, render a muted non-link `<span className="text-xs text-slate-400">—</span>` rather than a
dead anchor.

---

## 3. Pricing display hierarchy

Three tiers, visually distinct (since totals now always reconcile to the sum of activities):

**Tier 1 — Activity row (cost column).** Keep right-aligned. De-emphasize slightly vs. the day
subtotal: `text-sm text-slate-700 tabular-nums`. Add `tabular-nums` everywhere money renders so
columns align.

**Tier 2 — Day subtotal (table `tfoot` + collapsed header).** Make the footer clearly a subtotal,
not just another row:
```tsx
<tr className="border-t-2 border-slate-200 bg-slate-50/60">
  <td colSpan={3} className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Day subtotal</td>
  <td className="px-3 py-3 text-right text-sm font-bold text-slate-900 tabular-nums">{money(dayTotal)}</td>
  <td />
</tr>
```
In the collapsed day header, the day total chip should read as a subtotal:
`rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-semibold text-slate-700 tabular-nums` and
**show on mobile too** (drop the `hidden ... sm:inline` — see §6 responsive).

Optional per-day cost bar (nice polish): under the day header, a thin bar showing this day's share
of the grand total — `<div className="h-1 bg-brand-500" style={{width: `${dayTotal/grandTotal*100}%`}} />`
inside a `h-1 bg-slate-100` track. Add `aria-hidden` (decorative).

**Tier 3 — Grand total (summary card).** Already prominent. Reinforce that it equals the sum:
keep the large number, add a tiny caption `Sum of all activities` under it
(`text-[11px] text-brand-100`). Use `tabular-nums` on the figure.

Consolidate the three local `money()` copies (HomePage/SavedPage have their own, ItineraryView and
DayCard each have one) into a single `web/src/lib/format.ts` export.

---

## 4. Visual polish (elevation, not rewrite)

**Nav header (`App.tsx`)**
- Make it sticky and add subtle blur: `sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur`.
- Active nav item: add `aria-current={page==='home' ? 'page' : undefined}`.
- Logo button needs a focus ring (see §5).

**Hero (HomePage, pre-generation empty state)**
- `web/src/assets/hero.png` is currently unused. Use it: place a centered, rounded, shadowed hero
  image above the headline (`mx-auto max-w-md rounded-2xl shadow-lg`, with `alt=""` decorative or a
  descriptive alt). Constrain with `aspect-[16/9] object-cover` so layout is stable.
- Tighten headline rhythm: `text-3xl font-bold tracking-tight sm:text-4xl`, subhead `mt-3 text-base sm:text-lg text-slate-600`.

**Summary card (`ItineraryView`)**
- Good already. Add `tracking-tight` to destination heading; bump radius to `rounded-2xl`.
- Move pills to `gap-2 text-xs font-medium` with `bg-white/15 ring-1 ring-white/10` for crisper chips.

**Day cards**
- Bump to `rounded-2xl`. Header padding is fine. Add a hover lift: `transition hover:shadow-md`.
- Day number badge: add `ring-2 ring-brand-100` for a touch of depth on white.
- Theme line: `font-semibold text-slate-900` (was slate-800) for stronger hierarchy.

**Empty state (SavedItinerariesPage)**
- Add an icon and a CTA back to planning, not just text:
  - centered SVG (map/suitcase), `text-slate-300 h-10 w-10 mx-auto`
  - heading `mt-3 font-semibold text-slate-700` "No saved itineraries yet"
  - body `text-sm text-slate-500`
  - a `brand-600` button "Plan a trip" wired to nav (pass `onNavigateHome`).
- "Loading…" plain text → reuse a small skeleton list (3 gray rows) for consistency.

**Loading skeleton**
- Add `motion-reduce:animate-none` to the `animate-pulse` wrappers.
- The completion line should be `role="status"` (it lives inside an `aria-busy` container; fine, but
  make the live text explicit for SR users).

**Typography / spacing globals (`index.css`)**
- Add `-webkit-font-smoothing: antialiased;` to body for crisper text.
- Set `scroll-behavior: smooth;` but gate it: `@media (prefers-reduced-motion: reduce){ html{scroll-behavior:auto} }`.

---

## 5. Accessibility — specific fixes spotted

1. **Missing focus-visible rings.** Almost no interactive element has a visible focus style. Add
   `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2`
   to: nav buttons + logo (`App.tsx`), all PreferenceForm buttons/inputs (inputs have a focus ring;
   buttons don't), DayCard expand button, SavedPage View/Delete/pagination buttons, ItineraryView
   buttons, Map links. On the gradient summary card use `ring-white ring-offset-brand-600`.
2. **Radio/checkbox cards rely on color only.** Selected travel-style/pace/interest cards differ
   mainly by `brand-50` background. Add a non-color cue: when selected, render a small ✓ or
   `ring-2 ring-brand-500` AND keep `aria` correct — the native `input` is `sr-only` which is fine
   for SR, but ensure `:focus-visible` on the `sr-only` input draws a ring on the label:
   `has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500` on the `<label>`.
3. **Map link** had no accessible name beyond "Map" — fixed in §2 with place-specific `aria-label`.
4. **Delete is destructive with no confirm.** Add `aria-label={`Delete itinerary for ${it.destination}`}`
   and a lightweight inline confirm (two-click: "Delete" → "Confirm?") to prevent accidental loss.
5. **Color contrast.** `text-slate-400` on white (footer, range min/max labels, chevron) is ~3:1 —
   below 4.5:1 for body text. Bump footer + helper text to `text-slate-500`; the chevron is
   decorative so it's acceptable but give it `aria-hidden`.
6. **Reduced motion.** Add `motion-reduce:animate-none` to skeleton pulse, save spinner, toast
   animation; gate `scroll-behavior` (see §4).
7. **Toast announcement.** `role="status"` + `aria-live="polite"` (done in §1) so "Saved" is read.
8. **Heading order.** HomePage uses `h1`; ItineraryView jumps to `h2` then DayCard themes are `<p>`.
   Keep `h2` for the trip title and make day themes `h3` (currently `<p className="font-semibold">`)
   for a correct outline.

---

## 6. Responsive

1. **DayCard table overflows on mobile.** It already has `overflow-x-auto`, so it scrolls — but a
   5-column table is cramped on a phone and horizontal scroll is poor UX. **Recommended:** below
   `sm`, render activities as stacked cards instead of a table. Pattern: keep the `<table>` for
   `sm:` and up; for mobile map each activity to a `<div>` block:
   ```tsx
   {/* mobile: hidden sm:block on the table wrapper; block sm:hidden on this list */}
   <ul className="space-y-3 sm:hidden">
     {day.activities.map((a,i)=>(
       <li key={i} className="rounded-lg border border-slate-100 p-3">
         <div className="flex items-center justify-between">
           <span className="text-sm font-medium text-slate-700">{a.time}</span>
           <span className="text-sm font-semibold text-slate-900 tabular-nums">{money(a.estimated_cost_usd)}</span>
         </div>
         <p className="mt-1 font-medium text-slate-900">{a.place}</p>
         <p className="text-xs text-slate-500">{a.description}</p>
         <div className="mt-2 flex items-center justify-between">
           {/* category chip */}{/* Map link from §2 */}
         </div>
       </li>
     ))}
   </ul>
   ```
   Minimum viable alternative if stacked cards are too much: keep the table but add a subtle
   right-edge fade and ensure the Map column doesn't wrap.
2. **Day total hidden on mobile** (`hidden ... sm:inline`) — users on phones never see the per-day
   cost in the collapsed header. Show it always (§3); it's the most useful glanceable number.
3. **Summary card action row** wraps already (`flex-wrap`); ensure the new Save button sits above
   Est. total on narrow widths (`flex-col items-end gap-2` container).
4. **Saved list rows** already `flex-wrap` — fine.

---

## 7. Suggested token additions (optional, `tailwind.config.js`)
Not required, but tidies the spec:
```js
colors: {
  brand: { ...existing },
  success: { 500: '#10b981', 600: '#059669' }, // currently using raw emerald-500
}
```
And a keyframe for the toast (or use Tailwind's built-in `animate-in` only if a plugin exists — it
doesn't here, so define `fadeIn` in `index.css` under `@layer utilities`).

---

## 8. Implementation checklist (engineer-facing)
- [ ] `types`: add `saved: boolean`; `client.ts`: add `saveItinerary`.
- [ ] `ItineraryView`: save button (3 states) in summary card; toast; `onViewSaved`/`onReset`.
- [ ] `App.tsx`: pass `onNavigateSaved`/`onNavigateHome`; sticky+blur header; focus rings; `aria-current`.
- [ ] `HomePage`/`SavedPage`: forward nav callbacks; SavedPage empty-state CTA + skeleton loading.
- [ ] `DayCard`: Map link redesign + aria-label; day-subtotal styling; show total on mobile;
      mobile stacked-card layout; theme as `h3`; optional per-day bar.
- [ ] `lib/format.ts`: single `money()`; `tabular-nums` on all money.
- [ ] A11y sweep: focus-visible rings on every interactive element; `motion-reduce` on animations;
      bump `slate-400` body text to `slate-500`; destructive-delete confirm + aria-label.
- [ ] Use `hero.png` in the pre-generation hero.
