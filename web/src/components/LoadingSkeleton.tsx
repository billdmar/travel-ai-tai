export default function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6" aria-busy="true" aria-label="Generating itinerary">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="animate-pulse space-y-4 motion-reduce:animate-none">
          <div className="h-7 w-1/2 rounded bg-slate-200" />
          <div className="h-4 w-1/3 rounded bg-slate-200" />
          <div className="h-4 w-full rounded bg-slate-200" />
          <div className="h-4 w-5/6 rounded bg-slate-200" />
        </div>
      </div>

      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="animate-pulse space-y-4 motion-reduce:animate-none">
            <div className="h-6 w-2/5 rounded bg-slate-200" />
            <div className="space-y-2">
              <div className="h-4 w-full rounded bg-slate-100" />
              <div className="h-4 w-full rounded bg-slate-100" />
              <div className="h-4 w-3/4 rounded bg-slate-100" />
            </div>
          </div>
        </div>
      ))}

      <p role="status" className="text-center text-sm text-slate-500">
        Crafting your personalized itinerary&hellip;
      </p>
    </div>
  )
}
