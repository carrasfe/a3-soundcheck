export default function EvaluationDetailLoading() {
  return (
    <div className="min-h-full bg-gray-50 animate-pulse">
      {/* Nav bar */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-4 w-24 rounded bg-gray-200" />
            <div className="h-4 w-px bg-gray-200" />
            <div className="h-4 w-32 rounded bg-gray-200" />
          </div>
          <div className="flex gap-2">
            {[72, 48, 88, 72].map((w, i) => (
              <div key={i} className="h-8 rounded-lg bg-gray-200" style={{ width: w }} />
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        {/* Artist header card */}
        <div className="rounded-xl bg-gray-200 p-6 h-40" />

        {/* Weight profile card */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 h-4 w-40 rounded bg-gray-200" />
          <div className="flex flex-wrap gap-6">
            {[100, 120, 160, 100, 80].map((w, i) => (
              <div key={i}>
                <div className="mb-1 h-3 w-20 rounded bg-gray-100" />
                <div className="h-5 rounded bg-gray-200" style={{ width: w }} />
              </div>
            ))}
          </div>
        </div>

        {/* Pillar cards */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="bg-gray-100 px-5 py-3 flex items-center justify-between">
              <div className="h-5 w-40 rounded bg-gray-200" />
              <div className="h-6 w-12 rounded bg-gray-200" />
            </div>
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex items-center gap-4 border-b border-gray-50 px-5 py-2.5">
                <div className="h-4 w-36 rounded bg-gray-100" />
                <div className="ml-auto h-4 w-8 rounded bg-gray-100" />
                <div className="h-4 w-10 rounded bg-gray-100" />
                <div className="h-4 w-12 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
