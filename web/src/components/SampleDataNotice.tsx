/**
 * Explains that an itinerary's prose came from the deterministic mock provider
 * rather than a live language model.
 *
 * The hosted demo runs on the mock provider, and until now the only trace of
 * that in the UI was a `via mock` chip among the preference pills — which reads
 * as a glitch to anyone who does not know the codebase. Mock mode is a
 * deliberate, fully working demo mode, so it is stated plainly and the parts
 * that *are* real are named, rather than leaving a reader to assume the whole
 * page is fake.
 *
 * Renders nothing for a real provider, so it is safe to mount unconditionally.
 *
 * `provider` is persisted on the itinerary row and so survives a save, share or
 * reload. `fallbackReason` is only set on a fresh generation that degraded
 * mid-request (an exhausted Gemini quota, say) and is absent when the same trip
 * is fetched back later — it sharpens the message when present and is never
 * required for correctness.
 */
export function SampleDataNotice({
  provider,
  fallbackReason,
}: {
  provider: string | undefined
  fallbackReason?: string | null
}) {
  if (provider !== 'mock') return null

  // Built here rather than inline in the JSX: a multi-line template literal
  // keeps its newlines and indentation in the DOM text, which HTML collapses
  // visually but screen readers and copy-paste do not.
  const lead = fallbackReason
    ? `The live model was unavailable (${fallbackReason}), so the day-by-day plan below` +
      " came from this project's built-in sample generator."
    : "The day-by-day plan below came from this project's built-in sample generator," +
      ' which runs without an API key.'

  return (
    <aside
      aria-labelledby="sample-data-heading"
      className="flex items-start gap-3 rounded-xl border border-accent-200 bg-accent-50 px-4 py-3.5 text-sm text-ink-soft dark:border-accent-500/30 dark:bg-accent-500/10"
    >
      <svg
        aria-hidden="true"
        className="mt-0.5 h-4 w-4 shrink-0 text-accent-600"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 11-2 0 1 1 0 012 0zm-1 3a1 1 0 00-1 1v3a1 1 0 102 0v-3a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
      <div>
        <p id="sample-data-heading" className="font-medium text-ink">
          Sample itinerary — not written by a language model
        </p>
        <p className="mt-1 leading-relaxed">
          {lead} Everything around it is the real service: the plan is validated against the
          same schema a live model&rsquo;s output would be, costs are recomputed server-side,
          and the map, booking, export and share features all work on it. Set an API key and
          the same request goes to a real model.
        </p>
      </div>
    </aside>
  )
}

export default SampleDataNotice
