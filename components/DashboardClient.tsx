"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { EvaluationRow, DraftRow } from "@/app/page";
import type { ScoringResult } from "@/lib/scoring-engine";
import { getAgeProfileLabel } from "@/app/evaluations/new/types";
import DownloadPDFButton from "@/components/DownloadPDFButton";
import UploadScorecardModal from "@/components/UploadScorecardModal";
import UploadPDFModal from "@/components/UploadPDFModal";

// ── Display helpers ───────────────────────────────────────────

const TIER_DISPLAY: Record<string, string> = {
  Priority: "Priority",
  Active: "Active",
  Watch: "Watch",
  Pass: "Below",
};

const TIER_STYLES: Record<string, string> = {
  Priority: "bg-[#C0392B] text-white",
  Active: "bg-[#1B2A4A] text-white",
  Watch: "bg-gray-200 text-gray-700",
  Pass: "bg-gray-100 text-gray-500",
};

const TOURING_SHORT = ["", "Light", "Moderate", "Heavy", "Massive"];

function weightProfileLabel(r: ScoringResult, inputs?: Record<string, string> | null): string {
  const age = getAgeProfileLabel(inputs);
  const tour = TOURING_SHORT[r.touring_bracket] ?? "—";
  const w = r.pillar_weights;
  const weights = `${(w.p1 * 100).toFixed(0)}/${(w.p2 * 100).toFixed(0)}/${(w.p3 * 100).toFixed(0)}/${(w.p4 * 100).toFixed(0)}`;
  return `${age} · ${tour} (${weights})`;
}

// ── Sort types ────────────────────────────────────────────────

type SortKey =
  | "artist_name"
  | "genre"
  | "total_score"
  | "tier"
  | "revenue_tier"
  | "evaluator_name"
  | "created_at";

const TIER_ORDER: Record<string, number> = { Priority: 4, Active: 3, Watch: 2, Pass: 1 };
const REV_ORDER: Record<string, number> = { PREMIUM: 4, HIGH: 3, STANDARD: 2, LOW: 1 };

// ── Component ─────────────────────────────────────────────────

interface Props {
  evaluations: EvaluationRow[];
  drafts: DraftRow[];
  isAdmin: boolean;
  dbError?: string | null;
}

export default function DashboardClient({ evaluations, drafts, isAdmin, dbError }: Props) {
  const [search, setSearch] = useState("");
  const [filterGenre, setFilterGenre] = useState("");
  const [filterTier, setFilterTier] = useState("");
  const [filterEvaluator, setFilterEvaluator] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showUploadPDFModal, setShowUploadPDFModal] = useState(false);

  // ── Filter options ────────────────────────────────────────
  const genres = useMemo(
    () => Array.from(new Set(evaluations.map((e) => e.genre).filter(Boolean) as string[])).sort(),
    [evaluations]
  );
  const evaluators = useMemo(
    () => Array.from(new Set(evaluations.map((e) => e.evaluator_name))).sort(),
    [evaluations]
  );

  // ── Tier counts (over all evaluations, not just filtered) ──
  const tierCounts = useMemo(
    () => ({
      Priority: evaluations.filter((e) => e.results?.tier_label === "Priority").length,
      Active: evaluations.filter((e) => e.results?.tier_label === "Active").length,
      Watch: evaluations.filter((e) => e.results?.tier_label === "Watch").length,
      Pass: evaluations.filter((e) => e.results?.tier_label === "Pass").length,
    }),
    [evaluations]
  );

  // ── Filter + sort ─────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = evaluations;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((e) => e.artist_name?.toLowerCase().includes(q));
    }
    if (filterGenre) result = result.filter((e) => e.genre === filterGenre);
    if (filterTier) {
      result = result.filter((e) => {
        const tl = e.results?.tier_label;
        if (filterTier === "Below") return tl === "Pass";
        return tl === filterTier;
      });
    }
    if (filterEvaluator) result = result.filter((e) => e.evaluator_name === filterEvaluator);
    return result;
  }, [evaluations, search, filterGenre, filterTier, filterEvaluator]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number = 0;
      let bv: string | number = 0;
      switch (sortKey) {
        case "artist_name":    av = a.artist_name ?? ""; bv = b.artist_name ?? ""; break;
        case "genre":          av = a.genre ?? ""; bv = b.genre ?? ""; break;
        case "total_score":    av = a.results?.total_score ?? 0; bv = b.results?.total_score ?? 0; break;
        case "tier":           av = TIER_ORDER[a.results?.tier_label ?? ""] ?? 0; bv = TIER_ORDER[b.results?.tier_label ?? ""] ?? 0; break;
        case "revenue_tier":   av = REV_ORDER[a.results?.revenue_tier ?? ""] ?? 0; bv = REV_ORDER[b.results?.revenue_tier ?? ""] ?? 0; break;
        case "evaluator_name": av = a.evaluator_name; bv = b.evaluator_name; break;
        case "created_at":     av = a.created_at; bv = b.created_at; break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  // ── Handlers ──────────────────────────────────────────────
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "created_at" ? "desc" : "asc");
    }
  };

  const handleCopyLink = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/evaluations/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      prompt("Copy this link:", url);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setFilterGenre("");
    setFilterTier("");
    setFilterEvaluator("");
  };

  // ── Sort indicator ────────────────────────────────────────
  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col)
      return <span className="ml-1 text-gray-300 text-xs">↕</span>;
    return (
      <span className="ml-1 text-[#C0392B] text-xs">
        {sortDir === "asc" ? "↑" : "↓"}
      </span>
    );
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="bg-[#1B2A4A] px-6 py-5 text-white shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">Dashboard</h1>
            <p className="mt-1 text-sm text-white/60">
              {evaluations.length === 0 ? (
                "No evaluations yet"
              ) : (
                <>
                  {evaluations.length}{" "}
                  {evaluations.length === 1 ? "evaluation" : "evaluations"}:{" "}
                  <span className="font-semibold text-[#e05a4c]">{tierCounts.Priority} Priority</span>
                  {", "}
                  <span className="text-white/80">{tierCounts.Active} Active</span>
                  {", "}
                  <span className="text-white/80">{tierCounts.Watch} Watch</span>
                  {", "}
                  <span className="text-white/80">{tierCounts.Pass} Below</span>
                </>
              )}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setShowUploadPDFModal(true)}
              className="rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
            >
              Upload PDF
            </button>
            <button
              onClick={() => setShowUploadModal(true)}
              className="rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
            >
              Upload Scorecard
            </button>
          </div>
        </div>
      </div>
      {showUploadModal && <UploadScorecardModal onClose={() => setShowUploadModal(false)} />}
      {showUploadPDFModal && <UploadPDFModal onClose={() => setShowUploadPDFModal(false)} />}

      {/* DB error banner */}
      {dbError && (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700">
          <strong>Database error:</strong> {dbError}
        </div>
      )}

      {/* ── Action cards ──────────────────────────────────── */}
      <div className="shrink-0 border-b border-gray-200 bg-gray-50 px-6 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Card 1 — New Evaluation */}
          <Link
            href="/evaluations/new"
            className="group flex flex-col rounded-xl bg-[#C0392B] p-5 shadow-sm transition hover:bg-[#a93226] hover:shadow-md"
          >
            <span className="mb-3 text-2xl">📋</span>
            <p className="text-base font-bold text-white">New Evaluation</p>
            <p className="mt-1 text-xs text-white/70">Start a new artist scorecard</p>
          </Link>

          {/* Card 2 — Current A3 Clients */}
          <Link
            href="/artists?filter=a3clients"
            className="group flex flex-col rounded-xl bg-[#1B2A4A] p-5 shadow-sm transition hover:bg-[#152238] hover:shadow-md"
          >
            <span className="mb-3 text-2xl">⭐</span>
            <p className="text-base font-bold text-white">Current A3 Clients</p>
            <p className="mt-1 text-xs text-white/70">View and manage your A3 Merch client roster</p>
          </Link>

          {/* Card 3 — Artist Soundchecks */}
          <Link
            href="/artists"
            className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-[#1B2A4A]/30 hover:shadow-md"
          >
            <span className="mb-3 text-2xl">🎤</span>
            <p className="text-base font-bold text-[#1B2A4A]">Artist Soundchecks</p>
            <p className="mt-1 text-xs text-gray-500">Browse all artists and evaluation history</p>
          </Link>
        </div>
      </div>

      {/* ── Drafts ────────────────────────────────────────── */}
      {drafts.length > 0 && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-6 py-4">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-amber-800">
            Saved Drafts ({drafts.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {drafts.map((d) => (
              <Link
                key={d.id}
                href={`/evaluations/new?edit=${d.id}`}
                className="flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm shadow-sm transition hover:border-amber-400 hover:shadow-md"
              >
                <span className="font-semibold text-[#1B2A4A]">{d.artist_name}</span>
                <span className="text-xs text-gray-400">
                  {new Date(d.updated_at).toLocaleDateString()}
                </span>
                <span className="text-xs font-medium text-amber-700">Continue →</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent Evaluations ─────────────────────────────── */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-6 pt-5 pb-0">
        <p className="text-sm font-semibold uppercase tracking-wider text-gray-500">Recent Evaluations</p>
      </div>

      {/* Filters */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search artists…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20"
          />
          <select
            value={filterGenre}
            onChange={(e) => setFilterGenre(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20"
          >
            <option value="">All Genres</option>
            {genres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            value={filterTier}
            onChange={(e) => setFilterTier(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20"
          >
            <option value="">All Tiers</option>
            <option value="Priority">Priority</option>
            <option value="Active">Active</option>
            <option value="Watch">Watch</option>
            <option value="Below">Below</option>
          </select>
          <select
            value={filterEvaluator}
            onChange={(e) => setFilterEvaluator(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20"
          >
            <option value="">All Evaluators</option>
            {evaluators.map((ev) => (
              <option key={ev} value={ev}>
                {ev}
              </option>
            ))}
          </select>
          {(search || filterGenre || filterTier || filterEvaluator) && (
            <button
              onClick={clearFilters}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition"
            >
              Clear filters
            </button>
          )}
          {filtered.length !== evaluations.length && (
            <span className="self-center text-xs text-gray-400">
              Showing {sorted.length} of {evaluations.length}
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            {evaluations.length === 0 ? (
              <>
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                  <span className="text-2xl text-gray-400">📋</span>
                </div>
                <p className="text-lg font-semibold text-gray-700">No evaluations yet</p>
                <p className="mt-1 text-sm text-gray-500">
                  Create your first evaluation to get started.
                </p>
                <Link
                  href="/evaluations/new"
                  className="mt-5 rounded-lg bg-[#C0392B] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a93226] transition"
                >
                  + New Evaluation
                </Link>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold text-gray-700">No results match your filters</p>
                <button
                  onClick={clearFilters}
                  className="mt-3 text-sm text-[#C0392B] hover:underline"
                >
                  Clear all filters
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <Th onClick={() => handleSort("artist_name")}>
                    Artist Name <SortIcon col="artist_name" />
                  </Th>
                  <Th onClick={() => handleSort("genre")}>
                    Genre <SortIcon col="genre" />
                  </Th>
                  <Th center onClick={() => handleSort("total_score")}>
                    Score <SortIcon col="total_score" />
                  </Th>
                  <Th center onClick={() => handleSort("tier")}>
                    Tier <SortIcon col="tier" />
                  </Th>
                  <Th onClick={() => handleSort("revenue_tier")}>
                    Revenue <SortIcon col="revenue_tier" />
                  </Th>
                  <Th>Weight Profile</Th>
                  <Th onClick={() => handleSort("evaluator_name")}>
                    Evaluated By <SortIcon col="evaluator_name" />
                  </Th>
                  <Th onClick={() => handleSort("created_at")}>
                    Date <SortIcon col="created_at" />
                  </Th>
                  <Th right>Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((ev) => (
                  <tr
                    key={ev.id}
                    className="cursor-pointer transition-colors hover:bg-gray-50"
                    onClick={() => (window.location.href = `/evaluations/${ev.id}`)}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/evaluations/${ev.id}`}
                        className="font-semibold text-[#1B2A4A] hover:text-[#C0392B] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {ev.artist_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{ev.genre || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-bold text-[#1B2A4A]">
                        {ev.results?.total_score?.toFixed(2) ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {ev.results?.tier_label ? (
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            TIER_STYLES[ev.results.tier_label]
                          }`}
                        >
                          {TIER_DISPLAY[ev.results.tier_label] ?? ev.results.tier_label}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-gray-600">
                      {ev.results?.revenue_tier ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {ev.results ? weightProfileLabel(ev.results, ev.inputs as Record<string, string>) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{ev.evaluator_name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                      {new Date(ev.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <ActionBtn href={`/evaluations/${ev.id}`}>View</ActionBtn>
                        {ev.results && (
                          <DownloadPDFButton
                            data={{
                              artistName: ev.artist_name,
                              genre: ev.genre,
                              evaluatorName: ev.evaluator_name,
                              evaluationDate: ev.created_at,
                              evaluationId: ev.id,
                              results: ev.results,
                              inputs: ev.inputs as any,
                            }}
                            className="rounded border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50 hover:text-[#1B2A4A] disabled:opacity-60"
                          >
                            PDF
                          </DownloadPDFButton>
                        )}
                        <button
                          onClick={(e) => handleCopyLink(ev.id, e)}
                          className="rounded border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50 hover:text-[#1B2A4A]"
                        >
                          {copiedId === ev.id ? "✓ Copied" : "Link"}
                        </button>
                        <ActionBtn href={`/evaluations/new?prefill=${ev.id}`}>
                          Re-eval
                        </ActionBtn>
                        {isAdmin && (
                          <ActionBtn
                            href={`/evaluations/new?edit=${ev.id}`}
                            navy
                          >
                            Edit
                          </ActionBtn>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Small helper components ───────────────────────────────────

function Th({
  children,
  onClick,
  center,
  right,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  center?: boolean;
  right?: boolean;
}) {
  return (
    <th
      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 ${
        center ? "text-center" : right ? "text-right" : "text-left"
      } ${onClick ? "cursor-pointer select-none hover:text-[#1B2A4A]" : ""}`}
      onClick={onClick}
    >
      {children}
    </th>
  );
}

function ActionBtn({
  href,
  children,
  navy,
}: {
  href: string;
  children: React.ReactNode;
  navy?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className={`rounded border px-2.5 py-1 text-xs font-medium transition ${
        navy
          ? "border-[#1B2A4A] text-[#1B2A4A] hover:bg-[#1B2A4A] hover:text-white"
          : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-[#1B2A4A]"
      }`}
    >
      {children}
    </Link>
  );
}
