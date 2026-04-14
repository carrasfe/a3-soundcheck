"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ArtistRow } from "@/app/artists/page";
import { updateArtistFlags } from "@/app/artists/actions";
import type { ArtistBulkAction } from "@/app/artists/actions";

// ─── Constants ────────────────────────────────────────────────

const TIER_STYLES: Record<string, string> = {
  Priority: "bg-[#C0392B] text-white",
  Active:   "bg-[#1B2A4A] text-white",
  Watch:    "bg-gray-200 text-gray-700",
  Pass:     "bg-gray-100 text-gray-500",
};

const TIER_ORDER: Record<string, number> = { Priority: 4, Active: 3, Watch: 2, Pass: 1 };

type SortKey = "name" | "genre" | "latest_score" | "latest_tier" | "last_evaluated" | "eval_count";
type Tab = "all" | "a3clients" | "archived";

interface BulkActionDef {
  action: ArtistBulkAction;
  label: string;
  style: "red" | "navy" | "gray";
}

const TAB_ACTIONS: Record<Tab, BulkActionDef[]> = {
  all:       [
    { action: "set_a3_client", label: "Move to A3 Clients", style: "red" },
    { action: "archive",       label: "Archive",            style: "gray" },
  ],
  a3clients: [
    { action: "remove_a3_client", label: "Remove from A3 Clients", style: "gray" },
    { action: "archive",          label: "Archive",                style: "gray" },
  ],
  archived: [
    { action: "restore", label: "Restore", style: "navy" },
  ],
};

const ACTION_CONFIRM: Record<ArtistBulkAction, (n: number) => string> = {
  set_a3_client:    (n) => `Add ${n} artist${n !== 1 ? "s" : ""} to A3 Clients?`,
  remove_a3_client: (n) => `Remove ${n} artist${n !== 1 ? "s" : ""} from A3 Clients?`,
  archive:          (n) => `Archive ${n} artist${n !== 1 ? "s" : ""}?`,
  restore:          (n) => `Restore ${n} artist${n !== 1 ? "s" : ""}?`,
};

// ─── Props ────────────────────────────────────────────────────

interface Props {
  artists: ArtistRow[];
  dbError: string | null;
  initialTab?: Tab;
}

// ─── Component ───────────────────────────────────────────────

export default function ArtistsClient({ artists, dbError, initialTab = "all" }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Tab & filter state
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [search, setSearch]           = useState("");
  const [filterGenre, setFilterGenre] = useState("");
  const [filterTier, setFilterTier]   = useState("");
  const [sortKey, setSortKey]         = useState<SortKey>("name");
  const [sortDir, setSortDir]         = useState<"asc" | "desc">("asc");

  // Selection & bulk action state
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<ArtistBulkAction | null>(null);
  const [actionError, setActionError]     = useState<string | null>(null);

  // ── Tab counts ─────────────────────────────────────────────
  const tabCounts = useMemo(() => ({
    all:       artists.filter((a) => !a.is_archived).length,
    a3clients: artists.filter((a) => a.is_a3_client && !a.is_archived).length,
    archived:  artists.filter((a) => a.is_archived).length,
  }), [artists]);

  // ── Tab + filter + sort pipeline ───────────────────────────
  const tabFiltered = useMemo(() => {
    switch (activeTab) {
      case "all":       return artists.filter((a) => !a.is_archived);
      case "a3clients": return artists.filter((a) => a.is_a3_client && !a.is_archived);
      case "archived":  return artists.filter((a) => a.is_archived);
    }
  }, [artists, activeTab]);

  const genres = useMemo(
    () => Array.from(new Set(tabFiltered.map((a) => a.genre).filter(Boolean) as string[])).sort(),
    [tabFiltered]
  );

  const filtered = useMemo(() => {
    let r = tabFiltered;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((a) => a.name.toLowerCase().includes(q));
    }
    if (filterGenre) r = r.filter((a) => a.genre === filterGenre);
    if (filterTier) {
      r = r.filter((a) => {
        if (filterTier === "Below") return a.latest_tier === "Pass";
        return a.latest_tier === filterTier;
      });
    }
    return r;
  }, [tabFiltered, search, filterGenre, filterTier]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "name":           av = a.name;                                bv = b.name; break;
        case "genre":          av = a.genre ?? "";                         bv = b.genre ?? ""; break;
        case "latest_score":   av = a.latest_score ?? -1;                 bv = b.latest_score ?? -1; break;
        case "latest_tier":    av = TIER_ORDER[a.latest_tier ?? ""] ?? 0; bv = TIER_ORDER[b.latest_tier ?? ""] ?? 0; break;
        case "last_evaluated": av = a.last_evaluated ?? "";               bv = b.last_evaluated ?? ""; break;
        case "eval_count":     av = a.eval_count;                          bv = b.eval_count; break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  // ── Handlers ───────────────────────────────────────────────

  const changeTab = (tab: Tab) => {
    setActiveTab(tab);
    setSelectedIds(new Set());
    setSearch("");
    setFilterGenre("");
    setFilterTier("");
    setActionError(null);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "last_evaluated" ? "desc" : "asc"); }
  };

  const clearFilters = () => { setSearch(""); setFilterGenre(""); setFilterTier(""); };

  const allVisibleSelected = sorted.length > 0 && sorted.every((a) => selectedIds.has(a.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) sorted.forEach((a) => next.delete(a.id));
      else sorted.forEach((a) => next.add(a.id));
      return next;
    });
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const executeBulkAction = () => {
    if (!confirmAction) return;
    startTransition(async () => {
      const result = await updateArtistFlags(Array.from(selectedIds), confirmAction);
      if (result.error) {
        setActionError(result.error);
        setConfirmAction(null);
      } else {
        setSelectedIds(new Set());
        setConfirmAction(null);
        router.refresh();
      }
    });
  };

  // ── Helpers ────────────────────────────────────────────────

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="ml-1 text-gray-300 text-xs">↕</span>;
    return <span className="ml-1 text-[#C0392B] text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {/* Confirmation dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <p className="text-base font-semibold text-gray-900">
              {ACTION_CONFIRM[confirmAction](selectedIds.size)}
            </p>
            <p className="mt-1 text-sm text-gray-500">This action can be undone later.</p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                disabled={isPending}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={executeBulkAction}
                disabled={isPending}
                className="flex-1 rounded-lg bg-[#1B2A4A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1B2A4A]/90 disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 bg-[#1B2A4A] px-6 py-5 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">Artists</h1>
            <p className="mt-1 text-sm text-white/60">
              {artists.length === 0
                ? "No artists yet"
                : `${artists.length} artist${artists.length === 1 ? "" : "s"} total`}
            </p>
          </div>
          <Link
            href="/evaluations/new"
            className="shrink-0 rounded-lg bg-[#C0392B] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a93226]"
          >
            + New Evaluation
          </Link>
        </div>
      </div>

      {/* DB error */}
      {dbError && (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700">
          <strong>Database error:</strong> {dbError}
        </div>
      )}

      {/* Action error */}
      {actionError && (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700">
          <strong>Error:</strong> {actionError}{" "}
          <button onClick={() => setActionError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-6">
        <div className="flex gap-0">
          {(["all", "a3clients", "archived"] as Tab[]).map((tab) => {
            const labels: Record<Tab, string> = { all: "All Artists", a3clients: "A3 Clients", archived: "Archived" };
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => changeTab(tab)}
                className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition ${
                  active
                    ? "border-[#C0392B] text-[#C0392B]"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {labels[tab]}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    active ? "bg-[#C0392B] text-white" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {tabCounts[tab]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bulk action bar — shown when rows are selected */}
      {someSelected && (
        <div className="shrink-0 border-b border-[#1B2A4A]/10 bg-[#1B2A4A]/5 px-6 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-[#1B2A4A]">
              {selectedIds.size} selected
            </span>
            <div className="h-4 w-px bg-gray-300" />
            {TAB_ACTIONS[activeTab].map(({ action, label, style }) => (
              <button
                key={action}
                onClick={() => { setConfirmAction(action); setActionError(null); }}
                disabled={isPending}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                  style === "red"  ? "bg-[#C0392B] text-white hover:bg-[#a93226]" :
                  style === "navy" ? "bg-[#1B2A4A] text-white hover:bg-[#1B2A4A]/90" :
                                     "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-xs text-gray-400 hover:text-gray-600"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

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
            {genres.map((g) => <option key={g} value={g}>{g}</option>)}
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
          {(search || filterGenre || filterTier) && (
            <button
              onClick={clearFilters}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
            >
              Clear filters
            </button>
          )}
          {filtered.length !== tabFiltered.length && (
            <span className="self-center text-xs text-gray-400">
              Showing {sorted.length} of {tabFiltered.length}
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            {tabFiltered.length === 0 ? (
              <>
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                  <span className="text-2xl text-gray-400">
                    {activeTab === "archived" ? "📦" : activeTab === "a3clients" ? "⭐" : "🎤"}
                  </span>
                </div>
                <p className="text-lg font-semibold text-gray-700">
                  {activeTab === "archived" ? "No archived artists" :
                   activeTab === "a3clients" ? "No A3 clients yet" :
                   "No artists yet"}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {activeTab === "a3clients"
                    ? "Mark artists as A3 clients from the All Artists tab."
                    : "Artists are created automatically when evaluations are saved."}
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold text-gray-700">No results match your filters</p>
                <button onClick={clearFilters} className="mt-3 text-sm text-[#C0392B] hover:underline">
                  Clear all filters
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {/* Checkbox column */}
                  <th className="w-10 px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-[#1B2A4A]"
                    />
                  </th>
                  <Th onClick={() => handleSort("name")}>Artist Name <SortIcon col="name" /></Th>
                  <Th onClick={() => handleSort("genre")}>Genre <SortIcon col="genre" /></Th>
                  <Th>Merch Provider</Th>
                  <Th center onClick={() => handleSort("latest_score")}>Score <SortIcon col="latest_score" /></Th>
                  <Th center onClick={() => handleSort("latest_tier")}>Tier <SortIcon col="latest_tier" /></Th>
                  <Th onClick={() => handleSort("last_evaluated")}>Last Evaluated <SortIcon col="last_evaluated" /></Th>
                  <Th center onClick={() => handleSort("eval_count")}># Evals <SortIcon col="eval_count" /></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((artist) => {
                  const isSelected = selectedIds.has(artist.id);
                  return (
                    <tr
                      key={artist.id}
                      className={`cursor-pointer transition-colors hover:bg-gray-50 ${isSelected ? "bg-blue-50/50" : ""}`}
                      onClick={() => (window.location.href = `/artists/${artist.id}`)}
                    >
                      {/* Checkbox */}
                      <td className="w-10 px-3 py-3 text-center" onClick={(e) => toggleSelect(artist.id, e)}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-[#1B2A4A]"
                        />
                      </td>
                      {/* Artist name + A3 badge */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/artists/${artist.id}`}
                            className="font-semibold text-[#1B2A4A] hover:text-[#C0392B] hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {artist.name}
                          </Link>
                          {artist.is_a3_client && (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider bg-[#C0392B] text-white">
                              A3 CLIENT
                            </span>
                          )}
                          {artist.is_archived && (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider bg-gray-400 text-white">
                              ARCHIVED
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{artist.genre || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{artist.merch_provider || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        {artist.latest_score != null ? (
                          <span className="font-bold text-[#1B2A4A]">{artist.latest_score.toFixed(2)}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {artist.latest_tier ? (
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${TIER_STYLES[artist.latest_tier] ?? "bg-gray-100 text-gray-500"}`}>
                            {artist.latest_tier === "Pass" ? "Below" : artist.latest_tier}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                        {artist.last_evaluated
                          ? new Date(artist.last_evaluated).toLocaleDateString()
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">
                        {artist.eval_count > 0 ? artist.eval_count : <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────

function Th({
  children, onClick, center,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  center?: boolean;
}) {
  return (
    <th
      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 ${
        center ? "text-center" : "text-left"
      } ${onClick ? "cursor-pointer select-none hover:text-[#1B2A4A]" : ""}`}
      onClick={onClick}
    >
      {children}
    </th>
  );
}
