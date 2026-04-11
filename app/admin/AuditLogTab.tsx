"use client";

import { useState } from "react";
import type { AuditEntry } from "./actions";
import { getAuditLog } from "./actions";

// ─── Event type display metadata ─────────────────────────────

const EVENT_META: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  evaluation_complete: {
    label: "Evaluation",
    color: "bg-[#1B2A4A]/10 text-[#1B2A4A]",
    icon: "📋",
  },
  model_change: {
    label: "Model Change",
    color: "bg-gray-100 text-gray-700",
    icon: "⚙️",
  },
  user_invited: {
    label: "User Invited",
    color: "bg-[#1B2A4A]/10 text-[#1B2A4A]",
    icon: "✉️",
  },
  role_changed: {
    label: "Role Changed",
    color: "bg-gray-100 text-gray-700",
    icon: "🔑",
  },
  user_deactivated: {
    label: "User Deactivated",
    color: "bg-[#C0392B]/10 text-[#C0392B]",
    icon: "🚫",
  },
  user_reactivated: {
    label: "User Reactivated",
    color: "bg-[#1B2A4A]/10 text-[#1B2A4A]",
    icon: "✅",
  },
};

const TIER_BADGE: Record<string, string> = {
  Priority: "bg-[#C0392B] text-white",
  Active:   "bg-[#1B2A4A] text-white",
  Watch:    "bg-gray-200 text-gray-700",
  Pass:     "bg-gray-100 text-gray-500",
};

function eventDescription(entry: AuditEntry): React.ReactNode {
  const d = entry.details ?? {};
  switch (entry.event_type) {
    case "evaluation_complete":
      return (
        <span>
          <strong>{entry.actor_name}</strong> evaluated{" "}
          <strong>{String(d.artist_name ?? "Unknown")}</strong>
          {d.genre ? ` (${d.genre})` : ""}
          {!!d.tier && (
            <>
              {" — "}
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                  TIER_BADGE[String(d.tier)] ?? TIER_BADGE.Pass
                }`}
              >
                {String(d.tier) === "Pass" ? "Below" : String(d.tier)}
              </span>
            </>
          )}
          {d.total_score !== undefined && (
            <span className="ml-1 text-xs text-gray-400">
              ({Number(d.total_score).toFixed(2)})
            </span>
          )}
        </span>
      );

    case "model_change":
      return (
        <span>
          <strong>{entry.actor_name}</strong> updated the scoring model
          {d.change_summary ? (
            <>
              : <em className="text-gray-600">{String(d.change_summary)}</em>
            </>
          ) : ""}
          {d.version !== undefined && (
            <span className="ml-1 text-xs text-gray-400">(v{String(d.version)})</span>
          )}
        </span>
      );

    case "user_invited":
      return (
        <span>
          <strong>{entry.actor_name}</strong> invited{" "}
          <strong>{String(d.email ?? "unknown")}</strong> as{" "}
          <span className="font-medium">{String(d.role ?? "evaluator")}</span>
        </span>
      );

    case "role_changed":
      return (
        <span>
          <strong>{entry.actor_name}</strong> changed a user&apos;s role to{" "}
          <strong>{String(d.new_role ?? "unknown")}</strong>
        </span>
      );

    case "user_deactivated":
      return (
        <span>
          <strong>{entry.actor_name}</strong> deactivated a user account
        </span>
      );

    case "user_reactivated":
      return (
        <span>
          <strong>{entry.actor_name}</strong> reactivated a user account
        </span>
      );

    default:
      return (
        <span>
          <strong>{entry.actor_name}</strong> — {entry.event_type}
        </span>
      );
  }
}

// ─── Main component ───────────────────────────────────────────

const EVENT_TYPES = [
  { value: "", label: "All Events" },
  { value: "evaluation_complete", label: "Evaluations" },
  { value: "model_change", label: "Model Changes" },
  { value: "user_invited", label: "User Invites" },
  { value: "role_changed", label: "Role Changes" },
  { value: "user_deactivated", label: "Deactivations" },
];

export default function AuditLogTab({ initialLog }: { initialLog: AuditEntry[] }) {
  const [log, setLog] = useState<AuditEntry[]>(initialLog);
  const [filter, setFilter] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    const updated = await getAuditLog(200);
    setLog(updated);
    setIsRefreshing(false);
  };

  const filtered = filter ? log.filter((e) => e.event_type === filter) : log;

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Activity Log</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {filtered.length} event{filtered.length !== 1 ? "s" : ""}
            {filter ? " matching filter" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#1B2A4A] focus:outline-none"
          >
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <p className="text-gray-500">
            {log.length === 0
              ? "No activity recorded yet."
              : "No events match the selected filter."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="divide-y divide-gray-100">
            {filtered.map((entry) => {
              const meta =
                EVENT_META[entry.event_type] ?? {
                  label: entry.event_type,
                  color: "bg-gray-100 text-gray-600",
                  icon: "•",
                };
              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  {/* Icon */}
                  <span className="mt-0.5 text-lg leading-none select-none">
                    {meta.icon}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">
                      {eventDescription(entry)}
                    </p>
                  </div>

                  {/* Right side: badge + time */}
                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.color}`}
                    >
                      {meta.label}
                    </span>
                    <time
                      className="whitespace-nowrap text-xs text-gray-400"
                      dateTime={entry.created_at}
                      title={new Date(entry.created_at).toLocaleString()}
                    >
                      {formatRelativeTime(entry.created_at)}
                    </time>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Relative time formatter ──────────────────────────────────

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
