"use client";

import { useState } from "react";
import Link from "next/link";
import type { EvaluationRecord } from "./page";
import type { ScoringResult, PillarBreakdown } from "@/lib/scoring-engine";
import { getAgeProfileLabel } from "@/app/evaluations/new/types";
import DownloadPDFButton from "@/components/DownloadPDFButton";

// ── Tier display ──────────────────────────────────────────────

const TIER_DISPLAY: Record<string, string> = {
  Priority: "Priority",
  Active: "Active",
  Watch: "Watch",
  Pass: "Below",
};

const TIER_STYLES: Record<string, string> = {
  Priority: "bg-[#C0392B] text-white",
  Active: "bg-[#1B2A4A] text-white",
  Watch: "border-2 border-gray-400 text-gray-700",
  Pass: "bg-gray-100 text-gray-500",
};

const TOURING_LABELS = ["", "Light", "Moderate", "Heavy", "Massive"];

// ── Input formatting helpers ──────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000)
    return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
}

const VIP_LABELS: Record<string, string> = {
  none: "No VIP",
  offered_before: "Offered Before",
  basic: "Basic",
  premium_mg: "Premium MG",
  tiered_high: "Tiered High",
};

const VENUE_PROG_LABELS: Record<string, string> = {
  smaller: "Smaller",
  same: "Same",
  slight_step_up: "Step-up",
  major_jump: "Major Jump",
  tier_change: "Tier Change",
};

// ── Pillar card ───────────────────────────────────────────────

function PillarCard({
  name,
  result,
  weight,
  subRows,
}: {
  name: string;
  result: PillarBreakdown;
  weight: number;
  subRows: Array<{ key: string; label: string; weight: number; inputVal?: string }>;
}) {
  const scoreColor =
    result.final_score >= 4
      ? "text-[#1B2A4A]"
      : result.final_score >= 3
      ? "text-[#1B2A4A]/70"
      : result.final_score >= 2
      ? "text-gray-600"
      : "text-[#C0392B]";

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm print:border-gray-300">
      <div className="flex items-center justify-between bg-[#1B2A4A]/5 px-5 py-3">
        <div>
          <span className="text-sm font-semibold text-[#1B2A4A]">{name}</span>
          <span className="ml-2 text-xs text-gray-500">
            ({(weight * 100).toFixed(0)}% of total)
          </span>
        </div>
        <span className={`text-xl font-bold ${scoreColor}`}>
          {result.final_score.toFixed(2)}
        </span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-xs text-gray-400">
            <th className="px-5 py-2 text-left font-medium">Metric</th>
            <th className="px-3 py-2 text-left font-medium">Input</th>
            <th className="px-3 py-2 text-center font-medium">Score</th>
            <th className="px-3 py-2 text-center font-medium">Weight</th>
            <th className="px-5 py-2 text-right font-medium">Contribution</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {subRows.map(({ key, label, weight: w, inputVal }) => {
            const s = result.sub_scores[key] ?? 0;
            return (
              <tr key={key}>
                <td className="px-5 py-2 text-gray-700">{label}</td>
                <td className="px-3 py-2 text-xs text-gray-400">{inputVal ?? "—"}</td>
                <td className="px-3 py-2 text-center font-semibold text-[#1B2A4A]">
                  {Number.isInteger(s) ? s : s.toFixed(1)}
                </td>
                <td className="px-3 py-2 text-center text-gray-400">
                  {(w * 100).toFixed(0)}%
                </td>
                <td className="px-5 py-2 text-right text-gray-600">
                  {(s * w).toFixed(3)}
                </td>
              </tr>
            );
          })}
        </tbody>
        {result.bonus !== undefined && result.bonus > 0 && (
          <tfoot>
            <tr className="border-t border-dashed border-gray-200 bg-emerald-50/50">
              <td
                className="px-5 py-1.5 text-xs text-emerald-700"
                colSpan={4}
              >
                Bonus (VIP / Discord)
              </td>
              <td className="px-5 py-1.5 text-right text-xs font-semibold text-emerald-700">
                +{result.bonus.toFixed(3)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

interface Props {
  evaluation: EvaluationRecord;
  isAdmin: boolean;
}

export default function EvaluationDetail({ evaluation, isAdmin }: Props) {
  const [linkCopied, setLinkCopied] = useState(false);
  const r: ScoringResult = evaluation.results;

  const pdfData = {
    artistName: evaluation.artist_name,
    genre: evaluation.genre,
    evaluatorName: evaluation.evaluator_name,
    evaluationDate: evaluation.created_at,
    evaluationId: evaluation.id,
    results: r,
    inputs: evaluation.inputs,
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/evaluations/${evaluation.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      prompt("Copy this link:", url);
    }
  };

  // P2 sub-weights are stored in results. Guard against undefined in case an old row's
  // JSONB didn't include sub_weights (accessing it would throw "Cannot read properties of undefined").
  const p2r = r.p2 as ScoringResult["p2"];
  const p2sw: Record<string, number> = p2r?.sub_weights ?? {};

  // Venue capacity + audience reach from inputs
  const cap = parseFloat((evaluation.inputs as any)?.venue_capacity ?? "0") || 0;
  const dates = parseFloat((evaluation.inputs as any)?.num_dates ?? "0") || 0;
  const st = parseFloat((evaluation.inputs as any)?.sell_through_pct ?? "0") || 0;
  const reach = Math.round(cap * dates * (st / 100));

  // ── Input display values ──────────────────────────────────
  // inp is null for older evaluations saved before the inputs column was added
  const inp = evaluation.inputs
    ? (evaluation.inputs as unknown as Record<string, string>)
    : null;
  const g = (key: string): string => inp?.[key] ?? "";
  const nv = (key: string): number => parseFloat(inp?.[key] ?? "") || 0;

  const inputDisplay: Record<string, string> = (() => {
    if (inp === null) return {} as Record<string, string>;

    // Resale signal
    const resSit = g("resale_situation");
    const fv = g("face_value");
    const rp = g("resale_price");
    const resaleStr =
      resSit === "not_sold_out"  ? "Not SO" :
      resSit === "some_sold_out" ? `Some SO $${fv}/$${rp}` :
      resSit === "all_sold_out"  ? `All SO $${fv}/$${rp}` : "—";

    // TikTok ER (avg_views / followers * 100)
    const ttFlwrs = nv("tiktok_followers");
    const ttViews = nv("tiktok_avg_views");
    const ttER = ttFlwrs > 0 ? (ttViews / ttFlwrs) * 100 : 0;
    const tiktokStr = ttFlwrs > 0
      ? `${ttER.toFixed(1)}% (${fmtNum(ttFlwrs)} flwrs)`
      : "—";

    // Spotify YoY
    const yoyRaw = g("spotify_yoy_pct");
    const listeners = nv("spotify_monthly_listeners");
    const yoyStr = (() => {
      if (!yoyRaw) return "—";
      const yoyNum = parseFloat(yoyRaw);
      const pct = `${yoyNum > 0 ? "+" : ""}${yoyNum.toFixed(1)}%`;
      return listeners > 0 ? `${pct} (${fmtNum(listeners)})` : pct;
    })();

    // IG 30-day growth
    const gainRaw = g("ig_30day_gain");
    const igFlwrs = nv("ig_followers");
    const igGrowthStr = (() => {
      if (!gainRaw) return "—";
      const gainNum = parseFloat(gainRaw);
      const gainStr = `${gainNum > 0 ? "+" : ""}${gainNum.toLocaleString()}`;
      return igFlwrs > 0 ? `${gainStr} (${fmtNum(igFlwrs)} flwrs)` : gainStr;
    })();

    return {
      // P1 — Touring
      venue_capacity:
        nv("venue_capacity") > 0 ? nv("venue_capacity").toLocaleString() : "—",
      sell_through:
        g("sell_through_pct") ? `${g("sell_through_pct")}%` : "—",
      total_audience_reach:
        reach > 0 ? reach.toLocaleString() : "—",
      market_coverage:
        g("market_coverage") ? `${g("market_coverage")}/5` : "—",
      resale: resaleStr,

      // P2 — Fan Engagement
      FCR:
        g("fan_concentration_ratio")
          ? `${parseFloat(g("fan_concentration_ratio")).toFixed(2)}%`
          : "—",
      FanID:
        g("p2_fan_identity") ? `${g("p2_fan_identity")}/5` : "—",
      IG_ER:
        g("ig_er_pct") && igFlwrs > 0
          ? `${parseFloat(g("ig_er_pct")).toFixed(2)}% (${fmtNum(igFlwrs)} flwrs)`
          : "—",
      Reddit:
        nv("reddit_members") > 0 ? nv("reddit_members").toLocaleString() : "—",
      MerchSent:
        g("merch_sentiment") ? `${g("merch_sentiment")}/5` : "—",
      TikTok: tiktokStr,
      YouTube:
        g("youtube_er_pct") && nv("youtube_subscribers") > 0
          ? `${parseFloat(g("youtube_er_pct")).toFixed(2)}% (${fmtNum(nv("youtube_subscribers"))} subs)`
          : "—",

      // P3 — E-Commerce
      store_quality:
        g("store_quality") ? `${g("store_quality")}/5` : "—",
      merch_range:
        g("merch_range") ? `${g("merch_range")}/5` : "—",
      price_point:
        g("price_point_highest")
          ? `$${parseFloat(g("price_point_highest")).toLocaleString()}`
          : "—",
      d2c:
        g("d2c_level") ? `${g("d2c_level")}/4` : "—",

      // P4 — Growth
      spotify_yoy: yoyStr,
      venue_progression:
        VENUE_PROG_LABELS[g("venue_progression")] ?? "—",
      ig_growth: igGrowthStr,
      press:
        g("press_score") ? `${g("press_score")}/5` : "—",
      playlist:
        g("playlist_score") ? `${g("playlist_score")}/5` : "—",
    };
  })();

  const iv = (key: string): string => inputDisplay[key] ?? "—";

  return (
    <div className="min-h-full bg-gray-50 print:bg-white">
      {/* ── Sticky nav bar (hidden in print) ── */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-6 py-3 shadow-sm print:hidden">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-[#1B2A4A] transition"
            >
              ← Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm font-semibold text-[#1B2A4A]">
              {evaluation.artist_name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/evaluations/new?prefill=${evaluation.id}`}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-[#1B2A4A] transition"
            >
              Re-evaluate
            </Link>
            {isAdmin && (
              <Link
                href={`/evaluations/new?edit=${evaluation.id}`}
                className="rounded-lg border border-[#1B2A4A] px-3 py-1.5 text-xs font-medium text-[#1B2A4A] transition hover:bg-[#1B2A4A] hover:text-white"
              >
                Edit
              </Link>
            )}
            <DownloadPDFButton
              data={pdfData}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-[#1B2A4A] transition disabled:opacity-60"
            >
              Download PDF
            </DownloadPDFButton>
            <button
              onClick={handleCopyLink}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-[#1B2A4A] transition"
            >
              {linkCopied ? "✓ Copied!" : "Copy Link"}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 print:max-w-full print:px-8 print:py-4 print:space-y-4">
        {/* ── Print-only header ── */}
        <div className="hidden print:block">
          <div className="mb-6 flex items-center justify-between border-b-2 border-[#1B2A4A] pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded bg-[#C0392B] text-base font-bold text-white">
                A3
              </div>
              <div>
                <p className="text-lg font-bold text-[#1B2A4A]">A3 Soundcheck</p>
                <p className="text-xs text-gray-500">Artist Evaluation Scorecard</p>
              </div>
            </div>
            <div className="text-right text-xs text-gray-500">
              <p>
                <strong>Artist:</strong> {evaluation.artist_name}
              </p>
              <p>
                <strong>Evaluated by:</strong> {evaluation.evaluator_name}
              </p>
              <p>
                <strong>Date:</strong>{" "}
                {new Date(evaluation.created_at).toLocaleDateString()}
              </p>
              <p>
                <strong>ID:</strong> {evaluation.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
          </div>
        </div>

        {/* ── Artist header card ── */}
        <div className="rounded-xl bg-[#1B2A4A] p-6 text-white print:rounded-none print:bg-white print:p-0 print:text-[#1B2A4A]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-white/60 print:text-gray-500">
                Evaluation Results
              </p>
              <h1 className="mt-1 text-2xl font-bold">{evaluation.artist_name}</h1>
              <p className="mt-0.5 text-sm text-white/70 print:text-gray-500">
                {evaluation.genre}
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-white/60 print:text-gray-400">
                <span>
                  <strong className="text-white/80 print:text-gray-600">
                    Evaluated by:
                  </strong>{" "}
                  {evaluation.evaluator_name}
                </span>
                <span>
                  <strong className="text-white/80 print:text-gray-600">Date:</strong>{" "}
                  {new Date(evaluation.created_at).toLocaleDateString()}
                </span>
                <span>
                  <strong className="text-white/80 print:text-gray-600">ID:</strong>{" "}
                  {evaluation.id.slice(0, 8).toUpperCase()}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/60 print:text-gray-500">Total Score</p>
              <p className="text-4xl font-black">{r.total_score.toFixed(2)}</p>
              <span
                className={`mt-1 inline-flex rounded-full px-3 py-0.5 text-sm font-bold ${
                  TIER_STYLES[r.tier_label]
                }`}
              >
                {TIER_DISPLAY[r.tier_label] ?? r.tier_label}
              </span>
            </div>
          </div>
          <p className="mt-4 border-t border-white/10 pt-4 text-sm text-white/80 print:border-gray-200 print:text-gray-600">
            {r.action}
          </p>
        </div>

        {/* ── Weight Profile ── */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
            Weight Profile Applied
          </h3>
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-xs text-gray-500">Audience Age Bracket</p>
              <p className="font-semibold text-gray-800">
                {getAgeProfileLabel(inp)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Touring Presence</p>
              <p className="font-semibold text-gray-800">
                {TOURING_LABELS[r.touring_bracket] ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Pillar Weights</p>
              <p className="font-semibold text-gray-800">
                P1 {(r.pillar_weights.p1 * 100).toFixed(0)}% / P2{" "}
                {(r.pillar_weights.p2 * 100).toFixed(0)}% / P3{" "}
                {(r.pillar_weights.p3 * 100).toFixed(0)}% / P4{" "}
                {(r.pillar_weights.p4 * 100).toFixed(0)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">P2 Genre Group</p>
              <p className="font-semibold text-gray-800">
                {r.genre_group} weights applied
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Revenue Tier</p>
              <p className="font-semibold text-gray-800">{r.revenue_tier}</p>
            </div>
          </div>
          {reach > 0 && (
            <div className="mt-3 flex items-center gap-3 border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-500">Total Audience Reach</p>
              <p className="text-lg font-bold text-[#C0392B]">
                {reach.toLocaleString()}
              </p>
            </div>
          )}
        </div>

        {/* ── Pillar breakdowns ── */}
        <PillarCard
          name="P1 — Touring"
          result={r.p1}
          weight={r.pillar_weights.p1}
          subRows={[
            { key: "venue_capacity",       label: "Venue Capacity",       weight: 0.25, inputVal: iv("venue_capacity") },
            { key: "sell_through",         label: "Sell-Through",         weight: 0.20, inputVal: iv("sell_through") },
            { key: "total_audience_reach", label: "Total Audience Reach", weight: 0.20, inputVal: iv("total_audience_reach") },
            { key: "market_coverage",      label: "Market Coverage",      weight: 0.15, inputVal: iv("market_coverage") },
            { key: "resale",               label: "Resale Signal",        weight: 0.20, inputVal: iv("resale") },
          ]}
        />

        <PillarCard
          name="P2 — Fan Engagement"
          result={r.p2}
          weight={r.pillar_weights.p2}
          subRows={[
            { key: "FCR",       label: "Fan Conversion Ratio",    weight: p2sw.FCR ?? 0,       inputVal: iv("FCR") },
            { key: "FanID",     label: "Fan Identity Signaling",  weight: p2sw.FanID ?? 0,     inputVal: iv("FanID") },
            { key: "IG_ER",     label: "Instagram Engagement",    weight: p2sw.IG_ER ?? 0,     inputVal: iv("IG_ER") },
            { key: "Reddit",    label: "Reddit",                  weight: p2sw.Reddit ?? 0,    inputVal: iv("Reddit") },
            { key: "MerchSent", label: "Merch Sentiment",         weight: p2sw.MerchSent ?? 0, inputVal: iv("MerchSent") },
            { key: "TikTok",    label: "TikTok Engagement",       weight: p2sw.TikTok ?? 0,    inputVal: iv("TikTok") },
            ...(!p2r?.youtube_excluded
              ? [{ key: "YouTube", label: "YouTube Engagement", weight: p2sw.YouTube ?? 0, inputVal: iv("YouTube") }]
              : []),
          ]}
        />

        <PillarCard
          name="P3 — E-Commerce"
          result={r.p3}
          weight={r.pillar_weights.p3}
          subRows={[
            { key: "store_quality", label: "Store Quality",      weight: 0.35, inputVal: iv("store_quality") },
            { key: "merch_range",   label: "Merch Range",        weight: 0.30, inputVal: iv("merch_range") },
            { key: "price_point",   label: "Price Point",        weight: 0.25, inputVal: iv("price_point") },
            { key: "d2c",           label: "D2C Infrastructure", weight: 0.10, inputVal: iv("d2c") },
          ]}
        />

        <PillarCard
          name="P4 — Growth Trajectory"
          result={r.p4}
          weight={r.pillar_weights.p4}
          subRows={[
            { key: "spotify_yoy",       label: "Spotify YoY",        weight: 0.30, inputVal: iv("spotify_yoy") },
            { key: "venue_progression", label: "Venue Progression",  weight: 0.25, inputVal: iv("venue_progression") },
            { key: "ig_growth",         label: "IG Growth",          weight: 0.20, inputVal: iv("ig_growth") },
            { key: "press",             label: "Press Coverage",     weight: 0.15, inputVal: iv("press") },
            { key: "playlist",          label: "Playlist Placement", weight: 0.10, inputVal: iv("playlist") },
          ]}
        />

        {/* ── Score composition bar (screen only) ── */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm print:hidden">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
            Score Composition
          </h3>
          <div className="space-y-2">
            {[
              { name: "P1 Touring",        score: r.p1.final_score, weight: r.pillar_weights.p1 },
              { name: "P2 Fan Engagement", score: r.p2.final_score, weight: r.pillar_weights.p2 },
              { name: "P3 E-Commerce",     score: r.p3.final_score, weight: r.pillar_weights.p3 },
              { name: "P4 Growth",         score: r.p4.final_score, weight: r.pillar_weights.p4 },
            ].map(({ name, score, weight }) => (
              <div key={name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {name}{" "}
                    <span className="text-gray-400">
                      ({(weight * 100).toFixed(0)}%)
                    </span>
                  </span>
                  <span className="font-semibold text-[#1B2A4A]">
                    {score.toFixed(2)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-[#C0392B] transition-all duration-500"
                    style={{ width: `${Math.min(100, (score / 5) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
            <span className="font-semibold text-gray-700">Total Score</span>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-black text-[#1B2A4A]">
                {r.total_score.toFixed(2)}
              </span>
              <span
                className={`rounded-full px-3 py-0.5 text-sm font-bold ${TIER_STYLES[r.tier_label]}`}
              >
                {TIER_DISPLAY[r.tier_label] ?? r.tier_label}
              </span>
            </div>
          </div>
        </div>

        {/* ── Action buttons (screen only) ── */}
        <div className="flex flex-wrap gap-3 pb-8 print:hidden">
          <DownloadPDFButton
            data={pdfData}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60"
          >
            Download PDF
          </DownloadPDFButton>
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            {linkCopied ? "✓ Link Copied!" : "Copy Link"}
          </button>
          <Link
            href={`/evaluations/new?prefill=${evaluation.id}`}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            Re-evaluate Artist
          </Link>
          {isAdmin && (
            <Link
              href={`/evaluations/new?edit=${evaluation.id}`}
              className="flex items-center gap-2 rounded-lg bg-[#1B2A4A] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#243561]"
            >
              Edit Evaluation
            </Link>
          )}
          <Link
            href="/"
            className="ml-auto flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
