"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ArtistDetail } from "@/app/artists/[id]/page";
import { updateArtistFlags } from "@/app/artists/actions";

const TIER_STYLES: Record<string, string> = {
  Priority: "bg-[#C0392B] text-white",
  Active:   "bg-[#1B2A4A] text-white",
  Watch:    "bg-gray-200 text-gray-700",
  Pass:     "bg-gray-100 text-gray-500",
};

export default function ArtistDetailClient({ artist }: { artist: ArtistDetail }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const latestEval = artist.evaluations[0] ?? null;

  const toggle = (action: Parameters<typeof updateArtistFlags>[1]) => {
    startTransition(async () => {
      await updateArtistFlags([artist.id], action);
      router.refresh();
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 bg-[#1B2A4A] px-6 py-5 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-white/50">
              <Link href="/artists" className="transition-colors hover:text-white/80">Artists</Link>
              {" / "}
              {artist.name}
            </p>
            <div className="mt-1 flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold">{artist.name}</h1>
              {artist.is_a3_client && (
                <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold tracking-wider bg-[#C0392B] text-white border border-white/20">
                  A3 CLIENT
                </span>
              )}
              {artist.is_archived && (
                <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold tracking-wider bg-white/20 text-white/70">
                  ARCHIVED
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-3">
              {artist.genre && (
                <span className="text-sm text-white/60">{artist.genre}</span>
              )}
              {latestEval?.tier_label && (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TIER_STYLES[latestEval.tier_label] ?? "bg-gray-100 text-gray-500"}`}>
                  {latestEval.tier_label === "Pass" ? "Below" : latestEval.tier_label}
                </span>
              )}
              {latestEval?.total_score != null && (
                <span className="text-sm font-bold text-white">{latestEval.total_score.toFixed(2)}</span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Link
              href="/evaluations/new"
              className="rounded-lg bg-[#C0392B] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a93226]"
            >
              + New Evaluation
            </Link>
            <div className="flex gap-2">
              {/* A3 Client toggle */}
              <button
                onClick={() => toggle(artist.is_a3_client ? "remove_a3_client" : "set_a3_client")}
                disabled={isPending}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                  artist.is_a3_client
                    ? "border-white/30 text-white/80 hover:bg-white/10"
                    : "border-white/40 bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                {artist.is_a3_client ? "Remove A3 Client" : "Mark as A3 Client"}
              </button>
              {/* Archive toggle */}
              <button
                onClick={() => toggle(artist.is_archived ? "restore" : "archive")}
                disabled={isPending}
                className="rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 disabled:opacity-50"
              >
                {artist.is_archived ? "Restore Artist" : "Archive Artist"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl space-y-8 px-6 py-8">
          {/* Artist Info */}
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
              Artist Info
            </h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                { label: "Management Company", value: artist.management_company },
                { label: "Manager(s)",          value: artist.manager_names },
                { label: "Booking Agent",       value: artist.booking_agent },
                { label: "Merch Provider",      value: artist.merch_provider },
                { label: "Genre",               value: artist.genre },
              ].map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
                  <dd className="mt-0.5 text-sm text-gray-800">{value || "—"}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Evaluation History */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
              Evaluation History
              <span className="ml-2 text-xs font-normal normal-case text-gray-400">
                {artist.evaluations.length} evaluation{artist.evaluations.length !== 1 ? "s" : ""}
              </span>
            </h2>

            {artist.evaluations.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
                <p className="text-sm text-gray-500">No completed evaluations yet.</p>
                <Link
                  href="/evaluations/new"
                  className="mt-4 inline-block rounded-lg bg-[#C0392B] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a93226]"
                >
                  Create Evaluation
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      {["Date", "Evaluator", "Total Score", "Tier", "Revenue", "Actions"].map((h, i) => (
                        <th
                          key={h}
                          className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 ${
                            i === 2 || i === 3 ? "text-center" : i === 5 ? "text-right" : "text-left"
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {artist.evaluations.map((ev, i) => (
                      <tr
                        key={ev.id}
                        className="cursor-pointer transition-colors hover:bg-gray-50"
                        onClick={() => (window.location.href = `/evaluations/${ev.id}`)}
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                          {new Date(ev.created_at).toLocaleDateString()}
                          {i === 0 && (
                            <span className="ml-2 rounded bg-[#1B2A4A]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#1B2A4A]">
                              Latest
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{ev.evaluator_name}</td>
                        <td className="px-4 py-3 text-center">
                          {ev.total_score != null ? (
                            <span className="font-bold text-[#1B2A4A]">{ev.total_score.toFixed(2)}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {ev.tier_label ? (
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${TIER_STYLES[ev.tier_label] ?? "bg-gray-100 text-gray-500"}`}>
                              {ev.tier_label === "Pass" ? "Below" : ev.tier_label}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-gray-600">{ev.revenue_tier ?? "—"}</td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <Link
                            href={`/evaluations/${ev.id}`}
                            className="rounded border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50 hover:text-[#1B2A4A]"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
