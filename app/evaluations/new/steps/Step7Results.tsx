"use client";

import { useMemo, useState } from "react";
import type { ScoringResult } from "@/lib/scoring-engine";
import type { EvalFormData } from "../types";
import { buildScoringInputs } from "../types";
import { calculateScore } from "@/lib/scoring-engine";
import DownloadPDFButton from "@/components/DownloadPDFButton";

interface Props {
  data: EvalFormData;
  savedId: string | null;
  isSaving: boolean;
  saveError: string | null;
  evaluatorName: string;
  onSave: () => void;
  onCopyLink: () => void;
  linkCopied: boolean;
}

const AGE_BRACKET_LABELS = ["", "Very Young (70%+)", "Young (55–70%)", "Mixed (45–55%)", "Mature (30–45%)", "Very Mature (<30%)"];
const TOURING_LABELS     = ["", "Light", "Moderate", "Heavy", "Massive"];

const TIER_STYLES: Record<string, string> = {
  Priority: "bg-[#C0392B] text-white",
  Active:   "bg-[#1B2A4A] text-white",
  Watch:    "border-2 border-gray-400 text-gray-700",
  Pass:     "bg-gray-100 text-gray-500",
};

function PillarCard({
  name, result, weight, subRows, bonus,
}: {
  name: string;
  result: { final_score: number; weighted_score: number; sub_scores: Record<string, number> };
  weight: number;
  subRows: Array<{ key: string; label: string; weight: number }>;
  bonus?: number;
}) {
  const scoreColor =
    result.final_score >= 4 ? "text-[#1B2A4A]"
    : result.final_score >= 3 ? "text-[#1B2A4A]/70"
    : result.final_score >= 2 ? "text-gray-600"
    : "text-[#C0392B]";

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm print:border-gray-300">
      <div className="flex items-center justify-between bg-[#1B2A4A]/5 px-5 py-3">
        <div>
          <span className="text-sm font-semibold text-[#1B2A4A]">{name}</span>
          <span className="ml-2 text-xs text-gray-500">({(weight * 100).toFixed(0)}% of total)</span>
        </div>
        <span className={`text-xl font-bold ${scoreColor}`}>{result.final_score.toFixed(2)}</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-xs text-gray-400">
            <th className="px-5 py-2 text-left font-medium">Metric</th>
            <th className="px-3 py-2 text-center font-medium">Score</th>
            <th className="px-3 py-2 text-center font-medium">Weight</th>
            <th className="px-5 py-2 text-right font-medium">Contribution</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {subRows.map(({ key, label, weight: w }) => {
            const s = result.sub_scores[key] ?? 0;
            return (
              <tr key={key}>
                <td className="px-5 py-2 text-gray-700">{label}</td>
                <td className="px-3 py-2 text-center font-semibold text-[#1B2A4A]">
                  {Number.isInteger(s) ? s : s.toFixed(1)}
                </td>
                <td className="px-3 py-2 text-center text-gray-400">{(w * 100).toFixed(0)}%</td>
                <td className="px-5 py-2 text-right text-gray-600">{(s * w).toFixed(3)}</td>
              </tr>
            );
          })}
        </tbody>
        {bonus !== undefined && bonus > 0 && (
          <tfoot>
            <tr className="border-t border-dashed border-gray-200 bg-emerald-50/50">
              <td className="px-5 py-1.5 text-xs text-emerald-700" colSpan={3}>Bonus (VIP / Discord)</td>
              <td className="px-5 py-1.5 text-right text-xs font-semibold text-emerald-700">+{bonus.toFixed(3)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export default function Step7Results({ data, savedId, isSaving, saveError, evaluatorName, onSave, onCopyLink, linkCopied }: Props) {
  const { result, scoringError } = useMemo<{ result: ScoringResult | null; scoringError: string | null }>(() => {
    const inputs = buildScoringInputs(data);
    if (!inputs || !data.genre) return { result: null, scoringError: null };
    try {
      return { result: calculateScore(inputs), scoringError: null };
    } catch (e) {
      return { result: null, scoringError: e instanceof Error ? e.message : String(e) };
    }
  }, [data]);

  if (!result) {
    const missingFields = !data.genre || !data.artist_name.trim();
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
        {scoringError ? (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#C0392B]/10">
              <span className="text-2xl text-[#C0392B]">!</span>
            </div>
            <p className="text-lg font-semibold text-gray-800">Scoring Error</p>
            <p className="max-w-md text-sm text-gray-500">
              The scoring engine encountered an unexpected issue. Please go back and verify your inputs.
            </p>
            <details className="mt-2 max-w-md text-left">
              <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600">
                Technical details
              </summary>
              <pre className="mt-2 overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-600">
                {scoringError}
              </pre>
            </details>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-gray-700">Missing required data</p>
            <p className="text-sm text-gray-500">
              {missingFields
                ? "Go back to Step 1 and fill in Artist Name and Genre."
                : "Go back and complete all required fields to see the results."}
            </p>
          </>
        )}
      </div>
    );
  }

  const r = result;
  const cap = parseFloat(data.venue_capacity) || 0;
  const dates = parseFloat(data.num_dates) || 0;
  const st = parseFloat(data.sell_through_pct) || 0;
  const reach = Math.round(cap * dates * (st / 100));

  const ageLbl     = AGE_BRACKET_LABELS[r.age_bracket];
  const touringLbl = TOURING_LABELS[r.touring_bracket];

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Print-only header */}
      <div className="hidden print:block">
        <div className="flex items-center justify-between border-b-2 border-[#1B2A4A] pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-[#C0392B] text-base font-bold text-white">A3</div>
            <div>
              <p className="text-lg font-bold text-[#1B2A4A]">A3 Soundcheck</p>
              <p className="text-xs text-gray-500">Artist Evaluation Scorecard</p>
            </div>
          </div>
          <div className="text-right text-xs text-gray-500">
            <p><strong>Artist:</strong> {data.artist_name}</p>
            <p><strong>Date:</strong> {new Date().toLocaleDateString()}</p>
            {savedId && <p><strong>ID:</strong> {savedId.slice(0, 8).toUpperCase()}</p>}
          </div>
        </div>
      </div>

      {/* Artist header card */}
      <div className="rounded-xl bg-[#1B2A4A] p-6 text-white print:rounded-none print:bg-white print:p-0 print:text-[#1B2A4A]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-white/60 print:text-gray-500">Evaluation Results</p>
            <h2 className="mt-1 text-2xl font-bold">{data.artist_name || "Artist"}</h2>
            <p className="mt-0.5 text-sm text-white/70 print:text-gray-500">{data.genre}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/60 print:text-gray-500">Total Score</p>
            <p className="text-4xl font-black">{r.total_score.toFixed(2)}</p>
            <span className={`mt-1 inline-flex rounded-full px-3 py-0.5 text-sm font-bold ${TIER_STYLES[r.tier_label]}`}>
              {r.tier_label}
            </span>
          </div>
        </div>
        <p className="mt-4 border-t border-white/10 pt-4 text-sm text-white/80 print:text-gray-600 print:border-gray-200">
          {r.action}
        </p>
      </div>

      {/* Weight Profile */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Weight Profile Applied</h3>
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500">Audience Age</p>
            <p className="font-semibold text-gray-800">{ageLbl}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Touring Presence</p>
            <p className="font-semibold text-gray-800">{touringLbl}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Pillar Weights</p>
            <p className="font-semibold text-gray-800">
              P1 {(r.pillar_weights.p1 * 100).toFixed(0)}% / P2 {(r.pillar_weights.p2 * 100).toFixed(0)}% / P3 {(r.pillar_weights.p3 * 100).toFixed(0)}% / P4 {(r.pillar_weights.p4 * 100).toFixed(0)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">P2 Genre Group</p>
            <p className="font-semibold text-gray-800">{r.genre_group} weights applied</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Revenue Tier</p>
            <p className="font-semibold text-gray-800">{r.revenue_tier}</p>
          </div>
        </div>
        {reach > 0 && (
          <div className="mt-3 border-t border-gray-100 pt-3 flex items-center gap-3">
            <p className="text-xs text-gray-500">Total Audience Reach</p>
            <p className="text-lg font-bold text-[#C0392B]">{reach.toLocaleString()}</p>
          </div>
        )}
      </div>

      {/* Pillar breakdowns */}
      <PillarCard
        name="P1 — Touring"
        result={r.p1}
        weight={r.pillar_weights.p1}
        bonus={r.p1.bonus}
        subRows={[
          { key: "venue_capacity",      label: "Venue Capacity",       weight: 0.25 },
          { key: "sell_through",        label: "Sell-Through",         weight: 0.20 },
          { key: "total_audience_reach",label: "Total Audience Reach", weight: 0.20 },
          { key: "market_coverage",     label: "Market Coverage",      weight: 0.15 },
          { key: "resale",              label: "Resale Signal",        weight: 0.20 },
        ]}
      />

      <PillarCard
        name="P2 — Fan Engagement"
        result={r.p2}
        weight={r.pillar_weights.p2}
        bonus={r.p2.bonus}
        subRows={[
          { key: "FCR",      label: "Fan Concentration Ratio",   weight: r.p2.sub_weights.FCR },
          { key: "FanID",    label: "Fan Identity Signaling",    weight: r.p2.sub_weights.FanID },
          { key: "IG_ER",    label: "Instagram Engagement",      weight: r.p2.sub_weights.IG_ER },
          { key: "Reddit",   label: "Reddit",                    weight: r.p2.sub_weights.Reddit },
          { key: "MerchSent",label: "Merch Sentiment",           weight: r.p2.sub_weights.MerchSent },
          { key: "TikTok",   label: "TikTok Engagement",         weight: r.p2.sub_weights.TikTok },
          ...(!r.p2.youtube_excluded ? [{ key: "YouTube", label: "YouTube Engagement", weight: r.p2.sub_weights.YouTube }] : []),
        ]}
      />

      <PillarCard
        name="P3 — E-Commerce"
        result={r.p3}
        weight={r.pillar_weights.p3}
        subRows={[
          { key: "store_quality", label: "Store Quality",       weight: 0.35 },
          { key: "merch_range",   label: "Merch Range",         weight: 0.30 },
          { key: "price_point",   label: "Price Point",         weight: 0.25 },
          { key: "d2c",           label: "D2C Infrastructure",  weight: 0.10 },
        ]}
      />

      <PillarCard
        name="P4 — Growth Trajectory"
        result={r.p4}
        weight={r.pillar_weights.p4}
        subRows={[
          { key: "spotify_yoy",       label: "Spotify YoY",          weight: 0.30 },
          { key: "venue_progression", label: "Venue Progression",    weight: 0.25 },
          { key: "ig_growth",         label: "IG Growth",            weight: 0.20 },
          { key: "press",             label: "Press Coverage",        weight: 0.15 },
          { key: "playlist",          label: "Playlist Placement",   weight: 0.10 },
        ]}
      />

      {/* Pillar contribution summary */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm print:hidden">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Score Composition</h3>
        <div className="space-y-2">
          {[
            { name: "P1 Touring",        score: r.p1.final_score, weight: r.pillar_weights.p1 },
            { name: "P2 Fan Engagement", score: r.p2.final_score, weight: r.pillar_weights.p2 },
            { name: "P3 E-Commerce",     score: r.p3.final_score, weight: r.pillar_weights.p3 },
            { name: "P4 Growth",         score: r.p4.final_score, weight: r.pillar_weights.p4 },
          ].map(({ name, score, weight }) => {
            const pct = (weight * 100).toFixed(0);
            const fill = Math.min(100, (score / 5) * 100);
            return (
              <div key={name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-gray-600">{name} <span className="text-gray-400">({pct}%)</span></span>
                  <span className="font-semibold text-[#1B2A4A]">{score.toFixed(2)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-[#C0392B] transition-all duration-500"
                    style={{ width: `${fill}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
          <span className="font-semibold text-gray-700">Total Score</span>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black text-[#1B2A4A]">{r.total_score.toFixed(2)}</span>
            <span className={`rounded-full px-3 py-0.5 text-sm font-bold ${TIER_STYLES[r.tier_label]}`}>
              {r.tier_label}
            </span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 print:hidden">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="flex items-center gap-2 rounded-lg bg-[#C0392B] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a93226] disabled:opacity-60"
        >
          {isSaving ? "Saving…" : savedId ? "Update Evaluation" : "Save Evaluation"}
        </button>
        <DownloadPDFButton
          data={{
            artistName: data.artist_name,
            genre: data.genre || null,
            evaluatorName,
            evaluationDate: new Date().toISOString(),
            evaluationId: savedId,
            results: r,
            inputs: data,
          }}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60"
        >
          Download Scorecard
        </DownloadPDFButton>
        <button
          onClick={onCopyLink}
          disabled={!savedId}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-40"
          title={!savedId ? "Save the evaluation first" : undefined}
        >
          {linkCopied ? "✓ Copied!" : "Copy Link"}
        </button>
      </div>

      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 print:hidden">
          {saveError}
        </div>
      )}
      {savedId && (
        <p className="text-xs text-gray-400 print:hidden">
          Evaluation ID: {savedId}
        </p>
      )}
    </div>
  );
}
