export default function DashboardLoading() {
  return (
    <div className="flex h-full flex-col animate-pulse">
      {/* Header */}
      <div className="shrink-0 bg-[#1B2A4A] px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="h-6 w-28 rounded bg-white/20" />
            <div className="mt-2 h-4 w-64 rounded bg-white/10" />
          </div>
          <div className="h-9 w-36 rounded-lg bg-white/20" />
        </div>
      </div>

      {/* Filter bar */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex flex-wrap gap-3">
          {[240, 136, 120, 156].map((w, i) => (
            <div key={i} className="h-10 rounded-lg bg-gray-200" style={{ width: w }} />
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 p-6">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {/* Table header */}
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex gap-6">
              {[120, 64, 44, 52, 60, 100, 80, 52, 80].map((w, i) => (
                <div key={i} className="h-3 rounded bg-gray-300" style={{ width: w }} />
              ))}
            </div>
          </div>
          {/* Rows */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-6 border-b border-gray-100 px-4 py-3.5 last:border-0"
            >
              <div className="h-4 w-32 rounded bg-gray-200" />
              <div className="h-4 w-16 rounded bg-gray-100" />
              <div className="h-4 w-10 rounded bg-gray-200" />
              <div className="h-5 w-14 rounded-full bg-gray-100" />
              <div className="h-4 w-14 rounded bg-gray-100" />
              <div className="h-4 w-24 rounded bg-gray-100" />
              <div className="h-4 w-20 rounded bg-gray-100" />
              <div className="h-4 w-14 rounded bg-gray-100" />
              <div className="ml-auto flex gap-1.5">
                {[40, 36, 36, 52].map((bw, j) => (
                  <div key={j} className="h-6 rounded bg-gray-100" style={{ width: bw }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
