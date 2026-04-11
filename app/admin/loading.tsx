export default function AdminLoading() {
  return (
    <div className="animate-pulse">
      {/* Page header */}
      <div className="border-b border-gray-200 bg-white px-8 py-6">
        <div className="h-7 w-40 rounded bg-gray-200" />
        <div className="mt-2 h-4 w-64 rounded bg-gray-100" />
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200 bg-white px-8">
        <div className="flex gap-1 py-1">
          {[100, 120, 80].map((w, i) => (
            <div key={i} className="h-10 rounded-t bg-gray-200" style={{ width: w }} />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl p-6 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-4 h-5 w-48 rounded bg-gray-200" />
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, j) => (
                <div key={j} className="h-9 rounded bg-gray-100" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
