"use client";

import { useMemo, useState } from "react";
import { Input, Select, ScoreSelector, ScoreBadge, MetricRow } from "../ui";
import type { EvalFormData, StepProps } from "../types";
import { buildScoringInputs } from "../types";
import { calculateScore } from "@/lib/scoring-engine";
import ChartmetricImportModal from "../csv/ChartmetricImportModal";

function fmt(n: number): string { return n.toLocaleString(); }

const VENUE_PROGRESSION_OPTIONS = [
  { value: "smaller",        label: "Smaller venues than previous cycle" },
  { value: "same",           label: "Same venue size" },
  { value: "slight_step_up", label: "Slight step-up" },
  { value: "major_jump",     label: "Major jump" },
  { value: "tier_change",    label: "Tier change (e.g. clubs → theatres)" },
];

export default function Step3Touring({ data, onChange, onCsvFill, errors }: StepProps) {
  const [showImportModal, setShowImportModal] = useState(false);
  const set = (key: keyof EvalFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ [key]: e.target.value });

  const cap   = parseFloat(data.venue_capacity)   || 0;
  const dates = parseFloat(data.num_dates)         || 0;
  const st    = parseFloat(data.sell_through_pct) || 0;
  const reach = cap * dates * (st / 100);

  const showResaleFields =
    data.resale_situation === "some_sold_out" || data.resale_situation === "all_sold_out";

  // Real-time scores (P1 for touring, P4 for venue progression)
  const scores = useMemo(() => {
    const inputs = buildScoringInputs(data);
    if (!inputs || !data.genre) return null;
    try {
      const result = calculateScore(inputs);
      return { p1: result.p1, p4: result.p4 };
    } catch { return null; }
  }, [data]);

  const p1 = scores?.p1 ?? null;

  return (
    <div className="space-y-6">
      {showImportModal && (
        <ChartmetricImportModal
          onApply={onCsvFill}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* Chartmetric import banner */}
      <div className="flex items-center justify-between rounded-xl border border-[#1B2A4A]/20 bg-[#1B2A4A]/5 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-[#1B2A4A]">Import platform data from Chartmetric</p>
          <p className="mt-0.5 text-xs text-[#1B2A4A]/70">
            Upload up to 5 CSVs to auto-fill Spotify, Instagram, TikTok and YouTube fields in Steps 4–6.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowImportModal(true)}
          className="shrink-0 flex items-center gap-1.5 rounded-lg bg-[#1B2A4A] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#243561]"
        >
          <span>📊</span>
          Import from Chartmetric CSVs
        </button>
      </div>

      {/* Core inputs */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
          Venue & Schedule
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricRow
            label="Venue Capacity"
            score={p1?.sub_scores.venue_capacity ?? null}
            weight="25%"
          >
            <Input
              label="Venue Capacity"
              required
              type="number"
              min={0}
              value={data.venue_capacity}
              onChange={set("venue_capacity")}
              placeholder="e.g. 3500"
              error={errors.venue_capacity}
              hint="Typical headlining venue size"
            />
          </MetricRow>
          <MetricRow
            label="Sell-Through %"
            score={p1?.sub_scores.sell_through ?? null}
            weight="20%"
          >
            <Input
              label="Sell-Through %"
              required
              type="number"
              min={0}
              max={100}
              value={data.sell_through_pct}
              onChange={set("sell_through_pct")}
              placeholder="e.g. 85"
              error={errors.sell_through_pct}
              hint="Enter as 85, not 0.85"
            />
          </MetricRow>
          <MetricRow
            label="US/CA Dates"
            score={p1?.sub_scores.total_audience_reach ?? null}
            weight="20%"
          >
            <Input
              label="Number of US/CA Dates"
              required
              type="number"
              min={0}
              value={data.num_dates}
              onChange={set("num_dates")}
              placeholder="e.g. 24"
              error={errors.num_dates}
              hint="This cycle"
            />
          </MetricRow>
        </div>

        {/* Auto-calculated reach */}
        {reach > 0 && (
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-[#1B2A4A]/5 px-4 py-3">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Audience Reach</p>
              <p className="text-xl font-bold text-[#1B2A4A]">{fmt(Math.round(reach))}</p>
              <p className="text-xs text-gray-400">
                {fmt(cap)} cap × {fmt(dates)} dates × {st}% sold = {fmt(Math.round(reach))}
              </p>
            </div>
            {p1 && (
              <div className="ml-auto text-right">
                <p className="text-xs text-gray-400">Score</p>
                <ScoreBadge score={p1.sub_scores.total_audience_reach} size="md" />
              </div>
            )}
          </div>
        )}
      </section>

      {/* Market coverage */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
          Market Coverage
          {p1 && (
            <span className="ml-2 inline-flex">
              <ScoreBadge score={p1.sub_scores.market_coverage} />
            </span>
          )}
          <span className="ml-1 text-xs font-normal text-gray-400">15% weight</span>
        </h3>
        <ScoreSelector
          label="Market Coverage Score"
          required
          value={data.market_coverage}
          onChange={(v) => onChange({ market_coverage: v })}
          descriptions={[
            "1 — Single market or regional only",
            "2 — Few markets, limited national reach",
            "3 — Moderate national coverage",
            "4 — Strong national presence",
            "5 — Full national + international coverage",
          ]}
          error={errors.market_coverage}
        />
      </section>

      {/* Resale demand */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
          Resale Demand Signal
          {p1 && (
            <span className="ml-2 inline-flex">
              <ScoreBadge score={p1.sub_scores.resale} />
            </span>
          )}
          <span className="ml-1 text-xs font-normal text-gray-400">20% weight</span>
        </h3>
        <Select
          label="Sold Out Status"
          value={data.resale_situation}
          onChange={set("resale_situation")}
        >
          <option value="not_sold_out">Not Sold Out</option>
          <option value="some_sold_out">Some Shows Sold Out</option>
          <option value="all_sold_out">All Shows Sold Out</option>
        </Select>

        {showResaleFields && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input
              label="Face Value (avg ticket)"
              type="number"
              min={0}
              value={data.face_value}
              onChange={set("face_value")}
              placeholder="e.g. 55"
              hint="Average face-value ticket price ($)"
              error={errors.face_value}
            />
            <Input
              label="Resale Price (avg)"
              type="number"
              min={0}
              value={data.resale_price}
              onChange={set("resale_price")}
              placeholder="e.g. 120"
              hint="Average resale price on secondary market ($)"
              error={errors.resale_price}
            />
            {data.face_value && data.resale_price && parseFloat(data.face_value) > 0 && (
              <div className="sm:col-span-2 flex items-center gap-2 text-sm text-gray-600">
                <span>Resale multiplier:</span>
                <span className="font-semibold text-[#1B2A4A]">
                  {(parseFloat(data.resale_price) / parseFloat(data.face_value)).toFixed(2)}×
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Venue Size Progression */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Venue Size Progression</h3>
            <p className="text-xs text-gray-500">25% weight in P4 — vs. last major cycle</p>
          </div>
          <ScoreBadge score={scores?.p4.sub_scores.venue_progression ?? null} />
        </div>
        <Select
          label="Venue progression vs. last cycle"
          required
          value={data.venue_progression}
          onChange={set("venue_progression")}
          error={errors.venue_progression}
        >
          <option value="">Select…</option>
          {VENUE_PROGRESSION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
        {data.venue_progression === "same" && (
          <p className="mt-1.5 text-xs text-gray-500">
            "Same venue size" auto-scores by capacity: &lt;1K=1, &lt;2.5K=2, &lt;5K=3, 5K+=4
          </p>
        )}
      </section>

      {/* Summary */}
      {p1 && (
        <section className="rounded-xl border border-[#1B2A4A]/20 bg-[#1B2A4A]/5 p-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
            P1 Live Preview
          </h3>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            {Object.entries({
              "Venue": p1.sub_scores.venue_capacity,
              "Sell-Thru": p1.sub_scores.sell_through,
              "Reach": p1.sub_scores.total_audience_reach,
              "Market": p1.sub_scores.market_coverage,
              "Resale": p1.sub_scores.resale,
            }).map(([k, v]) => (
              <div key={k} className="text-center">
                <p className="text-xs text-gray-500">{k}</p>
                <ScoreBadge score={v} size="md" />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-[#1B2A4A]/10 pt-3">
            <span className="text-sm font-medium text-gray-600">
              Weighted P1 Score (before VIP bonus)
            </span>
            <span className="text-lg font-bold text-[#1B2A4A]">
              {p1.weighted_score.toFixed(2)}
              {p1.bonus !== undefined && p1.bonus > 0 && (
                <span className="ml-1 text-sm font-normal text-emerald-600">
                  +{p1.bonus.toFixed(2)} VIP
                </span>
              )}
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
