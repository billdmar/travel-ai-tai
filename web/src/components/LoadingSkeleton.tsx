export default function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6" aria-busy="true" aria-label="Generating itinerary">
      <div className="rounded-xl border border-ink-line bg-canvas-raised p-6 shadow-frame">
        <div className="animate-pulse space-y-4 motion-reduce:animate-none">
          <div className="h-7 w-1/2 rounded bg-canvas-sunken" />
          <div className="h-4 w-1/3 rounded bg-canvas-sunken" />
          <div className="h-4 w-full rounded bg-canvas-sunken" />
          <div className="h-4 w-5/6 rounded bg-canvas-sunken" />
        </div>
      </div>

      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-ink-line bg-canvas-raised p-6 shadow-frame">
          <div className="animate-pulse space-y-4 motion-reduce:animate-none">
            <div className="h-6 w-2/5 rounded bg-canvas-sunken" />
            <div className="space-y-2">
              <div className="h-4 w-full rounded bg-canvas-sunken" />
              <div className="h-4 w-full rounded bg-canvas-sunken" />
              <div className="h-4 w-3/4 rounded bg-canvas-sunken" />
            </div>
          </div>
        </div>
      ))}

      <p role="status" className="text-center text-sm text-ink-faint">
        Crafting your personalized itinerary&hellip;
      </p>
    </div>
  )
}
