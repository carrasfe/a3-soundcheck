"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { ArtistRow } from "@/app/artists/page";

const TIER_STYLES: Record<string, string> = {
  Priority: "bg-[#C0392B] text-white",
  Active:   "bg-[#1B2A4A] text-white",
  Watch:    "bg-gray-200 text-gray-700",
  Pass:     "bg-gray-100 text-gray-500",
};

const TIER_ORDER: Record<string, number> = { Priority: 4, Active: 3, Watch: 2, Pass: 1 };

type SortKey = "name" | "genre" | "latest_score" | "latest_tier" | "last_evaluated" | "eval_count";

interface Props {
  artists: ArtistRow[];
  dbError: string | null;
}

export default function ArtistsClient({ artists, dbError }: Props) {
  const [search, setSearch]           = useState("");
  const [filterGenre, setFilterGenre] = useState("");
  const [filterTier, setFilterTier]   = useState("");
  const [sortKey, setSortKey]         = useState<SortKey>("name");
  const [sortDir, setSortDir]         = useState<"asc" | "desc">("asc");

  const genres = useMemo(
    () => Array.from(new Set(artists.map((a) => a.genre).filter(Boolean) as string[])).sort(),
    [artists]
  );

  const filtered = useMemo(() => {
    let r = artists;
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
  }, [artists, search, filterGenre, filterTier]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "name":           av = a.name;                              bv = b.name; break;
        case "genre":          av = a.genre ?? "";                       bv = b.genre ?? ""; break;
        case "latest_score":   av = a.latest_score ?? -1;               bv = b.latest_score ?? -1; break;
        case "latest_tier":    av = TIER_ORDER[a.latest_tier ?? ""] ?? 0; bv = TIER_ORDER[b.latest_tier ?? ""] ?? 0; break;
        case "last_evaluated": av = a.last_evaluated ?? "";              bv = b.last_evaluated ?? ""; break;
        case "eval_count":     av = a.eval_count;                        bv = b.eval_count; break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "last_evaluated" ? "desc" : "asc"); }
  };

  const clearFilters = () => { setSearch(""); setFilterGenre(""); setFilterTier(""); };

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="ml-1 text-gray-300 text-xs">↕</span>;
    return <span className="ml-1 text-[#C0392B] text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 bg-[#1B2A4A] px-6 py-5 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">Artists</h1>
            <p className="mt-1 text-sm text-white/60">
              {artists.length === 0
                ? "No artists yet"
                : `${artists.length} artist${artists.length === 1 ? "" : "s"}`}
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
          {filtered.length !== artists.length && (
            <span className="self-center text-xs text-gray-400">
              Showing {sorted.length} of {artists.length}
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            {artists.length === 0 ? (
              <>
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                  <span className="text-2xl text-gray-400">🎤</span>
                </div>
                <p className="text-lg font-semibold text-gray-700">No artists yet</p>
                <p className="mt-1 text-sm text-gray-500">
                  Artists are created automatically when evaluations are saved.
                </p>
                <Link
                  href="/evaluations/new"
                  className="mt-5 rounded-lg bg-[#C0392B] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a93226]"
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
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <Th onClick={() => handleSort("name")}>Artist Name <SortIcon col="name" /></Th>
                  <Th onClick={() => handleSort("genre")}>Genre <SortIcon col="genre" /></Th>
                  <Th>Merch Provider</Th>
                  <Th center onClick={() => handleSort("latest_score")}>Latest Score <SortIcon col="latest_score" /></Th>
                  <Th center onClick={() => handleSort("latest_tier")}>Tier <SortIcon col="latest_tier" /></Th>
                  <Th onClick={() => handleSort("last_evaluated")}>Last Evaluated <SortIcon col="last_evaluated" /></Th>
                  <Th center onClick={() => handleSort("eval_count")}># Evals <SortIcon col="eval_count" /></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((artist) => (
                  <tr
                    key={artist.id}
                    className="cursor-pointer transition-colors hover:bg-gray-50"
                    onClick={() => (window.location.href = `/artists/${artist.id}`)}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/artists/${artist.id}`}
                        className="font-semibold text-[#1B2A4A] hover:text-[#C0392B] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {artist.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{artist.genre || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{artist.merch_provider || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      {artist.latest_score != null ? (
                        <span className="font-bold text-[#1B2A4A]">
                          {artist.latest_score.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {artist.latest_tier ? (
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            TIER_STYLES[artist.latest_tier] ?? "bg-gray-100 text-gray-500"
                          }`}
                        >
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Th({
  children,
  onClick,
  center,
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
